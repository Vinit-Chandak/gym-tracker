import { and, desc, eq, gte, inArray, isNotNull, or, sql } from "drizzle-orm";

import {
  coachNotes,
  coachProgramRequests,
  programChangeProposals,
  programDrafts,
  programs,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { ProgramBlueprint } from "@/domain/program-blueprint";
import type { RequestPatch } from "@/domain/program-request";
import { summariseProgramDiff, changeSummaryLine } from "@/domain/program-change-summary";
import { changeFingerprints, diffPrograms, type ProgramDiff } from "@/domain/program-diff";
import { progress } from "@/domain/schedule";
import { defaultBand, tooNarrowToProgress, type RoleInput } from "@/domain/rep-bands";

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

/**
 * Every coach proposal waiting on the athlete against this programme, newest first.
 *
 * There should be one. Before this rule two could be written side by side, and a proposal
 * that replaces the waiting one replaces all of them, so none is left behind.
 */
export async function openCoachProposals(
  db: DbOrTx,
  userId: string,
  programId: string | null | undefined,
): Promise<PendingProposal[]> {
  if (!programId) return [];
  return db
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
    .limit(10);
}

/** The coach proposal waiting on the athlete against this programme, if there is one. */
export async function pendingCoachProposal(
  db: DbOrTx,
  userId: string,
  programId: string | null | undefined,
  exceptId?: string,
): Promise<PendingProposal | null> {
  const rows = await openCoachProposals(db, userId, programId);
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
        // Only the coach's own proposals. Saying no to a whole replacement programme is not
        // saying no to every slot it happened to drop or add.
        eq(programDrafts.source, "weekly"),
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
 * `askedFor` maps each change ID this result's own `proposed` decisions name to when that ask
 * was made. Asking again after saying no is the athlete changing their mind, which is theirs
 * to do at any time. An ask made before the decline is not: it was already answered by it,
 * and naming it cannot carry a declined change back in.
 */
export function repeatedDeclines(
  diff: ProgramDiff,
  declined: readonly DeclinedChange[],
  askedFor: ReadonlyMap<string, Date>,
): { fingerprint: string; label: string; declinedAt: Date; until: Date }[] {
  // Each change an ask names, fingerprinted on its own: its operation, a programme field, or
  // a day's own fields and status.
  const asked = new Map<string, Date>();
  const mark = (part: ProgramDiff, at: Date) => {
    for (const key of changeFingerprints(part).keys()) {
      const known = asked.get(key);
      if (!known || known < at) asked.set(key, at);
    }
  };
  for (const field of diff.program) {
    const at = askedFor.get(`program:${field.field}`);
    if (at) mark({ ...diff, program: [field], days: [] }, at);
  }
  for (const day of diff.days) {
    const dayAt = askedFor.get(`day:${day.key}`);
    if (dayAt) mark({ ...diff, program: [], days: [{ ...day, operations: [] }] }, dayAt);
    for (const operation of day.operations) {
      const at = askedFor.get(operation.id);
      if (at)
        mark({ ...diff, program: [], days: [{ ...day, fields: [], operations: [operation] }] }, at);
    }
  }
  const hits: { fingerprint: string; label: string; declinedAt: Date; until: Date }[] = [];
  for (const [fingerprint, label] of changeFingerprints(diff)) {
    // The most recent decline of this change is the answer an ask has to come after.
    const match = declined.find((entry) => entry.changes.has(fingerprint));
    if (!match) continue;
    const at = asked.get(fingerprint);
    if (at && at > match.declinedAt) continue;
    hits.push({ fingerprint, label, declinedAt: match.declinedAt, until: match.until });
  }
  return hits;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * When each change a result's `proposed` decisions name was asked for.
 *
 * An ask is dated by the note it came from — when the athlete said it — and failing that by
 * when the ask was opened. One this same result opens from a note it has just read is as new
 * as that note.
 */
export async function askedAt(
  db: DbOrTx,
  userId: string,
  patch: RequestPatch | null | undefined,
  now = new Date(),
): Promise<Map<string, Date>> {
  const proposed = (patch?.decisions ?? []).filter((decision) => decision.state === "proposed");
  if (!proposed.length) return new Map();
  const opened = new Map((patch?.open ?? []).map((entry) => [entry.id, entry.sourceId]));
  const known = proposed
    .map((decision) => decision.requestId)
    .filter((id) => !opened.has(id) && UUID.test(id));
  const existing = known.length
    ? await db
        .select({
          id: coachProgramRequests.id,
          sourceId: coachProgramRequests.sourceId,
          createdAt: coachProgramRequests.createdAt,
        })
        .from(coachProgramRequests)
        .where(
          and(eq(coachProgramRequests.userId, userId), inArray(coachProgramRequests.id, known)),
        )
    : [];
  const sourceOf = (id: string) =>
    opened.get(id) ?? existing.find((request) => request.id === id)?.sourceId;
  const noteIds = proposed
    .map((decision) => sourceOf(decision.requestId))
    .filter((source): source is string => !!source?.startsWith("note:"))
    .map((source) => source.slice("note:".length))
    .filter((id) => UUID.test(id));
  const notes = noteIds.length
    ? await db
        .select({ id: coachNotes.id, createdAt: coachNotes.createdAt })
        .from(coachNotes)
        .where(and(eq(coachNotes.userId, userId), inArray(coachNotes.id, noteIds)))
    : [];
  const when = new Map<string, Date>();
  for (const decision of proposed) {
    const source = sourceOf(decision.requestId);
    const at =
      notes.find((note) => `note:${note.id}` === source)?.createdAt ??
      existing.find((request) => request.id === decision.requestId)?.createdAt ??
      now;
    for (const ref of decision.changeRefs) {
      const earlier = when.get(ref);
      if (!earlier || earlier < at) when.set(ref, at);
    }
  }
  return when;
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
          : // Before 0037 a decline, a request for revisions and a discarded edit were all
            // just "rejected"; which of them it was is not known, so it is not called a decline.
            (draft.closedAs ?? "rejected");
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
      const band = defaultBand(exercise, "balanced");
      if (tooNarrowToProgress(band.role, slot.reps))
        issues.push(
          `${exercise.name} on ${day.name}: ${slot.reps[0]}–${slot.reps[1]} reps leaves no room to add a rep before a load step. Use a range at least two reps wide${band.reps ? ` (its default range is ${band.reps.join("–")})` : ""}.`,
        );
    });
  return issues;
}

/**
 * How many things are waiting on the athlete: the Changes tab's own count, for a link to it
 * from elsewhere. Open changes, older proposals still offered, and questions to answer — not
 * asks that are with the coach, which need nothing from them.
 */
export async function countWaitingOnAthlete(db: DbOrTx, userId: string): Promise<number> {
  const [row] = await db
    .select({
      changes: sql<number>`(select count(*) from ${programDrafts} where ${and(
        eq(programDrafts.userId, userId),
        inArray(programDrafts.status, ["editing", "ready"]),
        isNotNull(programDrafts.baseProgramId),
      )})`.mapWith(Number),
      proposals:
        sql<number>`(select count(*) from ${programChangeProposals} inner join ${programs} on ${eq(programs.id, programChangeProposals.programId)} where ${and(
          eq(programChangeProposals.userId, userId),
          eq(programChangeProposals.status, "proposed"),
          eq(programs.status, "active"),
        )})`.mapWith(Number),
      questions: sql<number>`(select count(*) from ${coachProgramRequests} where ${and(
        eq(coachProgramRequests.userId, userId),
        eq(coachProgramRequests.state, "needs_answer"),
      )})`.mapWith(Number),
    })
    .from(sql`(select 1) as one`);
  return (row?.changes ?? 0) + (row?.proposals ?? 0) + (row?.questions ?? 0);
}
