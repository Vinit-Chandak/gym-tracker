import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";

import {
  activities,
  occurrenceEditClaims,
  occurrenceEvents,
  occurrenceVersions,
  plannedOccurrences,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { ActivitySport } from "@/domain/activity";
import { CLAIM_MINUTES } from "@/domain/activity-limits";
import type { EndurancePrescription } from "@/domain/activity-prescription";
import {
  canLog,
  resolveOccurrence,
  splitByDate,
  type OccurrenceDisposition,
  type OccurrenceResolution,
} from "@/domain/occurrences";

/**
 * Reading and moving scheduled work (plan §7).
 *
 * Each occurrence answers for itself. Skipping, reopening or rescheduling one touches that
 * row and nothing else — a missed swim does not delay a run, and moving a ride does not move
 * the day. Strength keeps its own sequence, projected by `domain/schedule.ts`; nothing here
 * competes with it.
 */

export class OccurrenceNotFoundError extends Error {
  constructor() {
    super("That scheduled session no longer exists.");
    this.name = "OccurrenceNotFoundError";
  }
}

export class ClaimLostError extends Error {
  constructor() {
    super("Someone else is logging this session. Take it over to continue.");
    this.name = "ClaimLostError";
  }
}

export type ScheduledOccurrence = {
  id: string;
  sport: ActivitySport;
  disposition: OccurrenceDisposition;
  scheduledOn: string;
  scheduledLocalTime: string | null;
  orderIndex: number;
  revisionId: string;
  prescription: EndurancePrescription | null;
  familyId: string | null;
  originalWeekIndex: number | null;
  originalScheduledOn: string | null;
  resolution: OccurrenceResolution;
  loggable: boolean;
};

const columns = {
  id: plannedOccurrences.id,
  sport: plannedOccurrences.sport,
  disposition: plannedOccurrences.disposition,
  familyId: plannedOccurrences.familyId,
  originalWeekIndex: plannedOccurrences.originalWeekIndex,
  originalScheduledOn: plannedOccurrences.originalScheduledOn,
  revisionId: occurrenceVersions.id,
  scheduledOn: occurrenceVersions.scheduledOn,
  scheduledLocalTime: occurrenceVersions.scheduledLocalTime,
  orderIndex: occurrenceVersions.orderIndex,
  prescription: occurrenceVersions.prescription,
  activityId: activities.id,
  activityOutcome: activities.outcome,
  activityOccurredOn: activities.occurredOn,
};

type Row = {
  [K in keyof typeof columns]: (typeof columns)[K] extends { _: { data: infer T } } ? T : never;
};

function hydrate(row: Row): ScheduledOccurrence {
  const activity = row.activityId
    ? { id: row.activityId, outcome: row.activityOutcome!, occurredOn: row.activityOccurredOn! }
    : null;
  const resolution = resolveOccurrence({ disposition: row.disposition }, activity);
  return {
    id: row.id,
    sport: row.sport,
    disposition: row.disposition,
    scheduledOn: row.scheduledOn,
    scheduledLocalTime: row.scheduledLocalTime,
    orderIndex: row.orderIndex,
    revisionId: row.revisionId,
    prescription: row.prescription,
    familyId: row.familyId,
    originalWeekIndex: row.originalWeekIndex,
    originalScheduledOn: row.originalScheduledOn,
    resolution,
    loggable: canLog({ disposition: row.disposition }, activity),
  };
}

/** The base query: an occurrence, the revision in force, and the activity that answered it. */
function occurrenceQuery(tx: DbOrTx, userId: string) {
  return tx
    .select(columns)
    .from(plannedOccurrences)
    .innerJoin(
      occurrenceVersions,
      and(
        eq(occurrenceVersions.id, plannedOccurrences.currentRevisionId),
        eq(occurrenceVersions.userId, plannedOccurrences.userId),
      ),
    )
    .leftJoin(
      activities,
      and(
        eq(activities.occurrenceId, plannedOccurrences.id),
        eq(activities.userId, plannedOccurrences.userId),
      ),
    )
    .where(eq(plannedOccurrences.userId, userId))
    .$dynamic();
}

export async function getOccurrence(
  tx: DbOrTx,
  userId: string,
  occurrenceId: string,
): Promise<ScheduledOccurrence | null> {
  const rows = await occurrenceQuery(tx, userId).where(
    and(eq(plannedOccurrences.userId, userId), eq(plannedOccurrences.id, occurrenceId)),
  );
  const row = rows[0] as Row | undefined;
  return row ? hydrate(row) : null;
}

/**
 * Exactly what is scheduled for that date. Nothing rolls forward: Wednesday's unfinished swim
 * is Wednesday's, and it is found in the programme rather than piling onto Friday (TODAY-01).
 */
export async function occurrencesOnDate(
  tx: DbOrTx,
  userId: string,
  date: string,
): Promise<ScheduledOccurrence[]> {
  const rows = (await occurrenceQuery(tx, userId)
    .where(and(eq(plannedOccurrences.userId, userId), eq(occurrenceVersions.scheduledOn, date)))
    .orderBy(asc(occurrenceVersions.orderIndex), asc(plannedOccurrences.id))) as Row[];
  return rows.map(hydrate);
}

/** Standalone scheduled work, split into what is still to come and what is behind. */
export async function standaloneSchedule(
  tx: DbOrTx,
  userId: string,
  today: string,
): Promise<{ upcoming: ScheduledOccurrence[]; earlier: ScheduledOccurrence[] }> {
  const rows = (await occurrenceQuery(tx, userId)
    .where(and(eq(plannedOccurrences.userId, userId), sql`${plannedOccurrences.familyId} is null`))
    .orderBy(asc(occurrenceVersions.scheduledOn), asc(occurrenceVersions.orderIndex))) as Row[];
  return splitByDate(rows.map(hydrate), today);
}

/** A programme's occurrences, for the Cycle view that owns the full programme. */
export async function programmeOccurrences(
  tx: DbOrTx,
  userId: string,
  familyId: string,
  options: { sport?: ActivitySport; from?: string; to?: string } = {},
): Promise<ScheduledOccurrence[]> {
  const where = [eq(plannedOccurrences.userId, userId), eq(plannedOccurrences.familyId, familyId)];
  if (options.sport) where.push(eq(plannedOccurrences.sport, options.sport));
  if (options.from) where.push(gte(occurrenceVersions.scheduledOn, options.from));
  if (options.to) where.push(lt(occurrenceVersions.scheduledOn, options.to));
  const rows = (await occurrenceQuery(tx, userId)
    .where(and(...where))
    .orderBy(asc(occurrenceVersions.scheduledOn), asc(occurrenceVersions.orderIndex))) as Row[];
  return rows.map(hydrate);
}

async function requireOccurrence(
  tx: DbOrTx,
  userId: string,
  occurrenceId: string,
): Promise<ScheduledOccurrence> {
  const occurrence = await getOccurrence(tx, userId, occurrenceId);
  if (!occurrence) throw new OccurrenceNotFoundError();
  return occurrence;
}

/** Marks one occurrence skipped. Its neighbours, its day and its sport are untouched. */
export async function skipOccurrence(
  tx: DbOrTx,
  userId: string,
  occurrenceId: string,
  note?: string,
): Promise<void> {
  const occurrence = await requireOccurrence(tx, userId, occurrenceId);
  if (occurrence.resolution.kind === "logged") throw new OccurrenceNotFoundError();
  await tx
    .update(plannedOccurrences)
    .set({ disposition: "skipped", updatedAt: new Date() })
    .where(and(eq(plannedOccurrences.userId, userId), eq(plannedOccurrences.id, occurrenceId)));
  await tx.insert(occurrenceEvents).values({
    userId,
    occurrenceId,
    kind: "skipped",
    actor: "athlete",
    detail: note ? { note } : null,
  });
}

/** Undoing a skip restores that same occurrence; it never creates a second one. */
export async function reopenOccurrence(
  tx: DbOrTx,
  userId: string,
  occurrenceId: string,
): Promise<void> {
  await requireOccurrence(tx, userId, occurrenceId);
  await tx
    .update(plannedOccurrences)
    .set({ disposition: "pending", updatedAt: new Date() })
    .where(and(eq(plannedOccurrences.userId, userId), eq(plannedOccurrences.id, occurrenceId)));
  await tx.insert(occurrenceEvents).values({
    userId,
    occurrenceId,
    kind: "reopened",
    actor: "athlete",
  });
}

/**
 * Moves one occurrence to another date by writing a new immutable revision.
 *
 * The original programme position stays where it was, so adherence still counts against the
 * week the work was first placed in, however often it moves (§7).
 */
export async function rescheduleOccurrence(
  tx: DbOrTx,
  userId: string,
  occurrenceId: string,
  scheduledOn: string,
  options: { scheduledLocalTime?: string | null; orderIndex?: number } = {},
): Promise<{ revisionId: string }> {
  const occurrence = await requireOccurrence(tx, userId, occurrenceId);
  if (occurrence.resolution.kind === "logged") throw new OccurrenceNotFoundError();
  const [current] = await tx
    .select()
    .from(occurrenceVersions)
    .where(
      and(eq(occurrenceVersions.userId, userId), eq(occurrenceVersions.id, occurrence.revisionId)),
    )
    .limit(1);
  if (!current) throw new OccurrenceNotFoundError();
  const [revision] = await tx
    .insert(occurrenceVersions)
    .values({
      occurrenceId,
      userId,
      sport: current.sport,
      programVersionId: current.programVersionId,
      programDayId: current.programDayId,
      scheduledOn,
      schedulingZone: current.schedulingZone,
      scheduledLocalTime:
        options.scheduledLocalTime === undefined
          ? current.scheduledLocalTime
          : options.scheduledLocalTime,
      orderIndex: options.orderIndex ?? current.orderIndex,
      prescriptionVersion: current.prescriptionVersion,
      prescription: current.prescription,
      templateRevisionId: current.templateRevisionId,
    })
    .returning({ id: occurrenceVersions.id });
  await tx
    .update(plannedOccurrences)
    .set({ currentRevisionId: revision!.id, updatedAt: new Date() })
    .where(and(eq(plannedOccurrences.userId, userId), eq(plannedOccurrences.id, occurrenceId)));
  await tx.insert(occurrenceEvents).values({
    userId,
    occurrenceId,
    kind: "rescheduled",
    actor: "athlete",
    occurredOn: scheduledOn,
    detail: { from: current.scheduledOn, to: scheduledOn },
  });
  return { revisionId: revision!.id };
}

export type EditClaim = {
  occurrenceId: string;
  pinnedRevisionId: string;
  draftToken: string;
  expiresAt: Date;
};

/**
 * A short lease on a planned log.
 *
 * It pins the revision the athlete is reading, so a coach acceptance cannot change the target
 * underneath them. It is not a timer and nothing is recording: it expires on its own, because
 * a browser that was closed must not freeze the programme (§5.3).
 */
export async function claimOccurrence(
  tx: DbOrTx,
  userId: string,
  occurrenceId: string,
  options: { takeOver?: boolean; now?: Date } = {},
): Promise<EditClaim> {
  const occurrence = await requireOccurrence(tx, userId, occurrenceId);
  const now = options.now ?? new Date();
  const [existing] = await tx
    .select()
    .from(occurrenceEditClaims)
    .where(
      and(
        eq(occurrenceEditClaims.userId, userId),
        eq(occurrenceEditClaims.occurrenceId, occurrenceId),
      ),
    )
    .limit(1);
  if (existing && existing.expiresAt > now && !options.takeOver) throw new ClaimLostError();

  const claim = {
    userId,
    occurrenceId,
    pinnedRevisionId: occurrence.revisionId,
    draftToken: crypto.randomUUID(),
    expiresAt: new Date(now.getTime() + CLAIM_MINUTES * 60_000),
  };
  await tx
    .insert(occurrenceEditClaims)
    .values(claim)
    .onConflictDoUpdate({
      target: [occurrenceEditClaims.userId, occurrenceEditClaims.occurrenceId],
      // A takeover rotates the token: the other tab keeps its input but cannot save with it.
      set: {
        pinnedRevisionId: claim.pinnedRevisionId,
        draftToken: claim.draftToken,
        expiresAt: claim.expiresAt,
        updatedAt: new Date(),
      },
    });
  return {
    occurrenceId,
    pinnedRevisionId: claim.pinnedRevisionId,
    draftToken: claim.draftToken,
    expiresAt: claim.expiresAt,
  };
}

/** Whether this token still holds the lease. An expired one is simply no longer held. */
export async function holdsClaim(
  tx: DbOrTx,
  userId: string,
  occurrenceId: string,
  draftToken: string,
  now: Date = new Date(),
): Promise<boolean> {
  const [claim] = await tx
    .select()
    .from(occurrenceEditClaims)
    .where(
      and(
        eq(occurrenceEditClaims.userId, userId),
        eq(occurrenceEditClaims.occurrenceId, occurrenceId),
      ),
    )
    .limit(1);
  if (!claim) return false;
  return claim.draftToken === draftToken && claim.expiresAt > now;
}

export async function releaseClaim(
  tx: DbOrTx,
  userId: string,
  occurrenceId: string,
): Promise<void> {
  await tx
    .delete(occurrenceEditClaims)
    .where(
      and(
        eq(occurrenceEditClaims.userId, userId),
        eq(occurrenceEditClaims.occurrenceId, occurrenceId),
      ),
    );
}

/** The occurrences a set of activities answered for, for callers rebuilding a view. */
export async function occurrencesById(
  tx: DbOrTx,
  userId: string,
  ids: readonly string[],
): Promise<Map<string, ScheduledOccurrence>> {
  if (ids.length === 0) return new Map();
  const rows = (await occurrenceQuery(tx, userId).where(
    and(eq(plannedOccurrences.userId, userId), inArray(plannedOccurrences.id, [...ids])),
  )) as Row[];
  return new Map(rows.map((row) => [row.id, hydrate(row)]));
}
