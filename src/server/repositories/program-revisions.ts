import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";

import {
  programChangeProposals,
  programSlotEvents,
  programs,
  sessionPlans,
  workoutSessions,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { programBlueprintSchema, type ProgramBlueprint } from "@/domain/program-blueprint";
import {
  applyProgramPatch,
  describePatch,
  programPatchSchema,
  ProgramPatchError,
  type ProgramPatch,
} from "@/domain/program-patch";
import type { ProposalSource } from "@/domain/types";

import { carryPlansToRevision, patchCarryChanges } from "./coach-plans";
import { carryGymFallbacks } from "./fallbacks";
import { materialiseProgramme } from "./program-occurrences";
import { createProgramFromBlueprint, readProgramBlueprint } from "./programs";

/**
 * Changing the programme itself.
 *
 * A programme version is immutable once active, so history always says what it was actually
 * prescribed. A change therefore arrives as a proposal, and approving one writes the next
 * version: the same days, the same lineage on every slot it keeps, the athlete's position in
 * the sequence carried across event by event. Nothing is edited in place and nothing logged
 * is touched.
 */

export class ProposalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProposalError";
  }
}

export type Proposal = typeof programChangeProposals.$inferSelect;
export type ProposalView = Proposal & { patch: ProgramPatch; lines: string[] };

function toView(row: Proposal): ProposalView | null {
  const patch = programPatchSchema.safeParse(row.patch);
  // A proposal whose patch no longer parses is one the app can no longer explain; it is
  // dropped from the list rather than shown as something the athlete could approve.
  if (!patch.success) return null;
  return { ...row, patch: patch.data, lines: describePatch(patch.data) };
}

/** Proposals still waiting on the athlete, newest first. */
export async function listOpenProposals(db: DbOrTx, userId: string): Promise<ProposalView[]> {
  const rows = await db
    .select({ proposal: programChangeProposals })
    .from(programChangeProposals)
    .innerJoin(programs, eq(programs.id, programChangeProposals.programId))
    .where(
      and(
        eq(programChangeProposals.userId, userId),
        eq(programChangeProposals.status, "proposed"),
        // A change proposed against a programme that has since been archived names slots the
        // athlete no longer trains. Applying it can only ever be refused, so it is not
        // offered: it stays in the record below, where it reads as history rather than as a
        // decision still waiting.
        eq(programs.status, "active"),
      ),
    )
    .orderBy(desc(programChangeProposals.createdAt))
    .limit(20);
  return rows
    .map((row) => toView(row.proposal))
    .filter((view): view is ProposalView => view !== null);
}

/** Everything ever proposed for this account, for the record on the programme screen. */
export async function listProposals(
  db: DbOrTx,
  userId: string,
  limit = 20,
): Promise<ProposalView[]> {
  const rows = await db
    .select()
    .from(programChangeProposals)
    .where(eq(programChangeProposals.userId, userId))
    .orderBy(desc(programChangeProposals.createdAt))
    .limit(limit);
  return rows.map(toView).filter((view): view is ProposalView => view !== null);
}

/**
 * The programme a patch leaves behind, held to the same rules as any other programme.
 *
 * A patch is checked operation by operation, and an operation can be valid on its own and
 * still leave a programme that is not: a run's effort given out of ten when programmes ask out
 * of five did exactly that. Written out unchecked, such a version is one nothing can read back
 * again — no edit, no review, no further change — so it is refused here, while somebody can
 * still fix it, rather than discovered later under the athlete's thumb.
 */
function patched(
  blueprint: ProgramBlueprint,
  patch: ProgramPatch,
  stale: string,
): ProgramBlueprint {
  let next: ProgramBlueprint;
  try {
    next = applyProgramPatch(blueprint, patch);
  } catch (error) {
    throw new ProposalError(error instanceof ProgramPatchError ? error.message : stale);
  }
  const checked = programBlueprintSchema.safeParse(next);
  if (!checked.success)
    throw new ProposalError(
      `The changed programme is not valid: ${checked.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
    );
  return checked.data;
}

export type CreateProposalInput = {
  source: ProposalSource;
  summary: string;
  rationale: string | null;
  patch: unknown;
};

/**
 * Records a proposed change, after checking it against the programme it is for.
 *
 * The patch is applied to a copy of the blueprint here and thrown away: a proposal that
 * cannot be applied is refused now, while the coach is still there to fix it, rather than
 * failing weeks later under the athlete's thumb.
 */
export async function createProposal(
  db: DbOrTx,
  userId: string,
  input: CreateProposalInput,
): Promise<Proposal> {
  const parsed = programPatchSchema.safeParse(input.patch);
  if (!parsed.success) {
    throw new ProposalError(
      `The change is not valid: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
    );
  }
  const [program] = await db
    .select({ id: programs.id })
    .from(programs)
    .where(
      and(
        eq(programs.userId, userId),
        eq(programs.sport, "strength"),
        eq(programs.status, "active"),
      ),
    )
    .limit(1);
  if (!program) throw new ProposalError("There is no active programme to change.");
  const current = await readProgramBlueprint(db, userId, program.id);
  if (!current) throw new ProposalError("The active programme could not be read.");
  patched(current.blueprint, parsed.data, "The change does not fit the programme.");
  const [row] = await db
    .insert(programChangeProposals)
    .values({
      userId,
      programId: program.id,
      source: input.source,
      summary: input.summary.slice(0, 300),
      rationale: input.rationale,
      patch: parsed.data,
    })
    .returning();
  if (!row) throw new Error("Proposal insert returned no row");
  return row;
}

export async function rejectProposal(
  db: DbOrTx,
  userId: string,
  proposalId: string,
): Promise<boolean> {
  const rows = await db
    .update(programChangeProposals)
    .set({ status: "rejected" })
    .where(
      and(
        eq(programChangeProposals.id, proposalId),
        eq(programChangeProposals.userId, userId),
        eq(programChangeProposals.status, "proposed"),
      ),
    )
    .returning({ id: programChangeProposals.id });
  return rows.length > 0;
}

export type AppliedProposal = { programId: string; version: number };

/**
 * Approves a proposal and writes the next version of the programme.
 *
 * The new version keeps the family, the start date and the slot the programme began on, so
 * the sequence is unchanged; every completed and skipped slot is copied across, so the
 * athlete stays exactly where they were; and each slot it keeps carries its lineage, so
 * comparable history still finds itself. The old version is archived, and every session ever
 * logged still points at the prescription it was actually given.
 */
export async function applyProposal(
  db: DbOrTx,
  userId: string,
  proposalId: string,
): Promise<AppliedProposal> {
  const [proposal] = await db
    .select()
    .from(programChangeProposals)
    .where(
      and(
        eq(programChangeProposals.id, proposalId),
        eq(programChangeProposals.userId, userId),
        eq(programChangeProposals.status, "proposed"),
      ),
    )
    .limit(1);
  if (!proposal) throw new ProposalError("That change is no longer waiting for an answer.");

  const [program] = await db
    .select()
    .from(programs)
    .where(
      and(
        eq(programs.userId, userId),
        eq(programs.id, proposal.programId),
        eq(programs.status, "active"),
      ),
    )
    .limit(1);
  if (!program) throw new ProposalError("The programme has changed since this was proposed.");
  if (program.id !== proposal.programId)
    throw new ProposalError("The programme has changed since this was proposed.");

  // A session mid-flight was started against the version about to be archived. Finishing it
  // first keeps its prescriptions and its slot event pointing at one programme, not two.
  const [open] = await db
    .select({ id: workoutSessions.id })
    .from(workoutSessions)
    .where(and(eq(workoutSessions.userId, userId), isNull(workoutSessions.completedAt)))
    .limit(1);
  if (open) throw new ProposalError("Finish or discard the open session before changing the plan.");

  const current = await readProgramBlueprint(db, userId, program.id);
  if (!current) throw new ProposalError("The active programme could not be read.");
  const patch = programPatchSchema.safeParse(proposal.patch);
  if (!patch.success) throw new ProposalError("This change can no longer be read.");
  const next = patched(
    current.blueprint,
    patch.data,
    "The programme has moved on and this change no longer fits.",
  );

  if (!program.startDate)
    throw new ProposalError(
      "The programme has no start date, so its sequence cannot be carried over.",
    );
  const created = await createProgramFromBlueprint(db, userId, next, {
    startDate: program.startDate,
    startDayIndex: current.startDayIndex,
    familyId: program.familyId,
    status: "active",
  });
  // What the athlete said each gym does instead of a lift is not part of the change.
  await carryGymFallbacks(db, userId, { fromProgramId: program.id, toProgramId: created.id });

  // Where the athlete had got to, carried over slot for slot — each half of a day with it.
  // A day that lifts and runs answers the two separately and keeps an event for each, so the
  // part has to come across: without it both halves arrive as the session, which collides on
  // the slot's own uniqueness and loses the run that answered it.
  const events = await db
    .select()
    .from(programSlotEvents)
    .where(eq(programSlotEvents.programId, program.id));
  if (events.length > 0) {
    await db.insert(programSlotEvents).values(
      events.map((event) => ({
        userId,
        programId: created.id,
        cycleIndex: event.cycleIndex,
        dayIndex: event.dayIndex,
        part: event.part,
        status: event.status,
        workoutSessionId: event.workoutSessionId,
        runId: event.runId,
        occurredOn: event.occurredOn,
        note: event.note,
      })),
    );
  }
  // A plan written against the old version names slots that no longer exist, but it is still
  // the plan the athlete was given: it moves onto the new version by lineage, minus whatever
  // this change itself rewrote.
  await carryPlansToRevision(db, userId, {
    fromProgramId: program.id,
    toProgramId: created.id,
    changes: patchCarryChanges(patch.data),
  });
  // A run's preparation follows its occurrence, which the new version keeps, as an approved
  // draft's does; one whose occurrence this change revises is withdrawn when it is revised.
  await db
    .update(sessionPlans)
    .set({ programId: created.id })
    .where(
      and(
        eq(sessionPlans.userId, userId),
        eq(sessionPlans.programId, program.id),
        eq(sessionPlans.status, "active"),
        isNotNull(sessionPlans.occurrenceId),
      ),
    );
  // The run half of a day is answered by its occurrence, and Today and the log screen read the
  // occurrence. Writing only the programme's runs left a changed run showing its new target on
  // the programme's day and its old one everywhere the athlete actually runs it.
  await materialiseProgramme(db, userId, {
    programId: created.id,
    familyId: program.familyId,
    blueprint: next,
    startDate: program.startDate,
    transition: "continue",
  });

  const now = new Date();
  await db
    .update(programChangeProposals)
    .set({
      status: "applied",
      approvedAt: now,
      appliedAt: now,
      appliedProgramId: created.id,
    })
    .where(eq(programChangeProposals.id, proposal.id));
  return { programId: created.id, version: created.version };
}
