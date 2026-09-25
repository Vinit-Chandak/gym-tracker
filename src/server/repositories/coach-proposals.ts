import { and, desc, eq, gte, inArray, isNotNull, or } from "drizzle-orm";

import { coachNotes, programDrafts } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { ProgramBlueprint } from "@/domain/program-blueprint";
import { summariseProgramDiff, changeSummaryLine } from "@/domain/program-change-summary";
import { changeFingerprints, diffPrograms, type ProgramDiff } from "@/domain/program-diff";
import { progress } from "@/domain/schedule";
import { exerciseRole, REP_BANDS, tooNarrowToProgress, type RoleInput } from "@/domain/rep-bands";

import { readProgramBlueprint } from "./programs";
import { getSchedule } from "./schedule";

/**
 * The rules that keep the coach's proposals one conversation rather than a pile.
 *
 * One proposal waits for the athlete at a time. A later review builds on it and takes its
 * place, so the same change is never offered twice side by side. A change the athlete
 * declined stays declined for a while: the coach may not put it back in front of them until
 * the cooldown is over, unless they ask for it themselves. And a week already trained is not
 * something a proposal can change, so it never appears in one.
 */

/** How long a declined change stays declined: "maybe one or two weeks later, ask again". */
export const DECLINE_COOLDOWN_DAYS = 14;
/** How far back the coach is told what the athlete decided about its proposals. */
const DECISIONS_WINDOW_DAYS = 28;

const DAY_MS = 86_400_000;

export type PendingProposal = typeof programDrafts.$inferSelect;

/** The coach proposal waiting on the athlete against this programme, if there is one. */
export async function pendingCoachProposal(
  db: DbOrTx,
  userId: string,
  programId: string | null | undefined,
  exceptId?: string,
): Promise<PendingProposal | null> {
  if (!programId) return null;
  const rows = await db
    .select()
    .from(programDrafts)
    .where(
      and(
        eq(programDrafts.userId, userId),
        eq(programDrafts.source, "weekly"),
        eq(programDrafts.baseProgramId, programId),
        inArray(programDrafts.status, ["editing", "ready"]),
      ),
    )
    .orderBy(desc(programDrafts.createdAt))
    .limit(5);
  return rows.find((row) => row.id !== exceptId) ?? null;
}

/**
 * The cycle the athlete is in, when the reviewed programme is the one they are training.
 *
 * Weeks before it are finished: their runs were run, or were not, and no proposal changes
 * that. Null when the programme has no schedule to read a position from.
 */
export async function currentCycleFor(
  db: DbOrTx,
  userId: string,
  programId: string | null | undefined,
): Promise<number | null> {
  if (!programId) return null;
  const schedule = await getSchedule(db, userId);
  if (!schedule || schedule.program.id !== programId) return null;
  return progress(schedule.state).currentCycle;
}

/**
 * The proposal with its finished weeks put back exactly as they were.
 *
 * A review sometimes restates every week of a run it rewrites, including weeks already
 * behind the athlete. Those rows change nothing anyone will do, and they were half of what a
 * proposal printed. The server keeps them as the base has them rather than asking the coach
 * to try again over something that has no effect.
 */
export function keepFinishedWeeks(
  proposed: ProgramBlueprint,
  base: ProgramBlueprint,
  currentCycle: number | null,
): ProgramBlueprint {
  if (!currentCycle || currentCycle <= 1) return proposed;
  const finished = (run: { weekIndex: number }) => run.weekIndex < currentCycle;
  return {
    ...proposed,
    runs: [
      ...base.runs.filter(finished).map((run) => structuredClone(run)),
      ...proposed.runs.filter((run) => !finished(run)),
    ].sort((a, b) => a.weekIndex - b.weekIndex || a.dayOfWeek - b.dayOfWeek),
  };
}

export type DeclinedChange = {
  draftId: string;
  declinedAt: Date;
  until: Date;
  headline: string;
  /** Fingerprint to a short description of the declined change. */
  changes: Map<string, string>;
};

/** Changes the athlete declined within the cooldown, with what each one was. */
export async function declinedChanges(
  db: DbOrTx,
  userId: string,
  now = new Date(),
): Promise<DeclinedChange[]> {
  const since = new Date(now.getTime() - DECLINE_COOLDOWN_DAYS * DAY_MS);
  const drafts = await db
    .select()
    .from(programDrafts)
    .where(
      and(
        eq(programDrafts.userId, userId),
        eq(programDrafts.closedAs, "declined"),
        gte(programDrafts.closedAt, since),
      ),
    )
    .orderBy(desc(programDrafts.closedAt))
    .limit(10);
  const declined: DeclinedChange[] = [];
  for (const draft of drafts) {
    if (!draft.baseProgramId || !draft.closedAt) continue;
    const base = await readProgramBlueprint(db, userId, draft.baseProgramId);
    if (!base) continue;
    declined.push({
      draftId: draft.id,
      declinedAt: draft.closedAt,
      until: new Date(draft.closedAt.getTime() + DECLINE_COOLDOWN_DAYS * DAY_MS),
      headline: draft.headline,
      changes: changeFingerprints(diffPrograms(base.blueprint, draft.blueprint)),
    });
  }
  return declined;
}

/**
 * Declined changes a proposal puts back, other than the ones the athlete has asked for again.
 *
 * `askedFor` are the operation IDs this result's own `proposed` decisions name: an explicit
 * new ask is the athlete changing their mind, and that is theirs to do at any time.
 */
export function repeatedDeclines(
  diff: ProgramDiff,
  declined: readonly DeclinedChange[],
  askedFor: ReadonlySet<string>,
): { fingerprint: string; label: string; declinedAt: Date; until: Date }[] {
  const asked = new Set<string>();
  // Fingerprints of the operations an ask names, found by recomputing them one at a time.
  for (const day of diff.days)
    for (const operation of day.operations)
      if (askedFor.has(operation.id))
        for (const key of changeFingerprints({
          ...diff,
          program: [],
          days: [{ ...day, fields: [], operations: [operation] }],
        }).keys())
          asked.add(key);
  const hits: { fingerprint: string; label: string; declinedAt: Date; until: Date }[] = [];
  const proposed = changeFingerprints(diff);
  for (const [fingerprint, label] of proposed) {
    if (asked.has(fingerprint)) continue;
    const match = declined.find((entry) => entry.changes.has(fingerprint));
    if (match) hits.push({ fingerprint, label, declinedAt: match.declinedAt, until: match.until });
  }
  return hits;
}

/**
 * What the athlete decided about the coach's recent proposals, for the coach to read.
 *
 * `decisions` used to be a list of draft ids, statuses and the programme's name — the same
 * name on every row — so a review could not tell a decline from a request for revisions, or
 * what either had been about. This says what each proposal changed, how the athlete
 * answered, the words they sent back with a revision, and until when a declined change must
 * stay out of the next proposal.
 */
export async function recentDecisionsForCoach(db: DbOrTx, userId: string, now = new Date()) {
  const since = new Date(now.getTime() - DECISIONS_WINDOW_DAYS * DAY_MS);
  const drafts = await db
    .select()
    .from(programDrafts)
    .where(
      and(
        eq(programDrafts.userId, userId),
        inArray(programDrafts.source, ["weekly", "manual"]),
        // A superseded draft is a decision only if it was offered and then closed. One set
        // aside the moment it was written — a review that changed nothing — never reached
        // the athlete, and carries no closing time.
        or(
          inArray(programDrafts.status, ["activated", "rejected"]),
          and(eq(programDrafts.status, "superseded"), isNotNull(programDrafts.closedAt)),
        ),
        gte(programDrafts.updatedAt, since),
      ),
    )
    .orderBy(desc(programDrafts.updatedAt))
    .limit(12);
  const noteIds = drafts.map((draft) => draft.revisionNoteId).filter((id): id is string => !!id);
  const notes = noteIds.length
    ? await db
        .select({ id: coachNotes.id, text: coachNotes.text })
        .from(coachNotes)
        .where(and(eq(coachNotes.userId, userId), inArray(coachNotes.id, noteIds)))
    : [];
  const result = [];
  for (const draft of drafts) {
    const base = draft.baseProgramId
      ? await readProgramBlueprint(db, userId, draft.baseProgramId)
      : null;
    if (!base) continue;
    const diff = diffPrograms(base.blueprint, draft.blueprint);
    const outcome =
      draft.status === "activated"
        ? "approved"
        : draft.status === "superseded"
          ? draft.closedAs === "replaced"
            ? "replaced_by_newer_proposal"
            : draft.closedAs === "outdated"
              ? "outdated"
              : "closed_when_programme_changed"
          : (draft.closedAs ?? "declined");
    const decidedAt = draft.closedAt ?? draft.updatedAt;
    result.push({
      draftId: draft.id,
      author: draft.source === "manual" ? "athlete" : "coach",
      outcome,
      decidedAt: decidedAt.toISOString(),
      headline: draft.headline,
      summary: changeSummaryLine(summariseProgramDiff(diff)),
      changes: [...changeFingerprints(diff)].map(([fingerprint, label]) => ({
        fingerprint,
        label,
      })),
      revisionNote: notes.find((note) => note.id === draft.revisionNoteId)?.text ?? null,
      doNotProposeAgainBefore:
        outcome === "declined"
          ? new Date(decidedAt.getTime() + DECLINE_COOLDOWN_DAYS * DAY_MS).toISOString()
          : null,
    });
  }
  return result;
}

/**
 * Rep ranges too narrow to progress in, among the slots this result writes.
 *
 * Only new or changed ranges are checked: a programme already running keeps whatever it was
 * approved with, and a review that touches nothing else must not be refused over a slot it
 * did not write. A creation has no base, so every slot is new.
 */
export function narrowRangeIssues(
  blueprint: ProgramBlueprint,
  base: ProgramBlueprint | null,
  library: readonly (RoleInput & { slug: string; name: string })[],
): string[] {
  const bySlug = new Map(library.map((exercise) => [exercise.slug, exercise]));
  let written: Set<string> | null = null;
  if (base) {
    written = new Set();
    for (const day of diffPrograms(base, blueprint).days) {
      if (day.dayIndex === null) continue;
      for (const operation of day.operations) {
        const changesRange =
          operation.kind === "added" ||
          operation.kind === "replaced" ||
          ((operation.kind === "retargeted" || operation.kind === "moved_out") &&
            operation.fields.some((field) => field.field === "target"));
        if (changesRange && "to" in operation && typeof operation.to === "object")
          written.add(
            `${operation.kind === "moved_out" ? operation.otherDayIndex : day.dayIndex}:${operation.to.position}`,
          );
      }
    }
  }
  const issues: string[] = [];
  for (const day of blueprint.days)
    day.exercises.forEach((slot, index) => {
      if (!slot.reps) return;
      if (written && !written.has(`${day.dayIndex}:${index + 1}`)) return;
      const exercise = bySlug.get(slot.exerciseSlug);
      if (!exercise) return;
      const role = exerciseRole(exercise);
      if (tooNarrowToProgress(role, slot.reps))
        issues.push(
          `${exercise.name} on ${day.name}: ${slot.reps[0]}–${slot.reps[1]} reps leaves no room to add a rep before a load step. Use a range at least two reps wide (its default band is ${REP_BANDS[role as keyof typeof REP_BANDS]?.muscle.join("–") ?? "wider"}).`,
        );
    });
  return issues;
}
