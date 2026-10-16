import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";

import {
  activities,
  occurrenceEditClaims,
  occurrenceEvents,
  occurrenceVersions,
  plannedOccurrences,
  programs,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { ActivitySport } from "@/domain/activity";
import { CLAIM_MINUTES } from "@/domain/activity-limits";
import type { EndurancePrescription } from "@/domain/activity-prescription";
import { todayInTimeZone } from "@/domain/program-calendar";
import {
  canLog,
  programmeClosed,
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

/**
 * A session of a programme the athlete has moved on from (ADR 0054). It keeps what became of
 * it, and nothing more can: logging, skipping, putting back and moving are all refused, in the
 * words its page uses ("… so this session can no longer be logged").
 */
export class OccurrenceClosedError extends Error {
  constructor() {
    super("This session's programme has ended, so it can no longer be logged, skipped or moved.");
    this.name = "OccurrenceClosedError";
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
  /**
   * Its programme is no longer the athlete's: replaced, or archived (ADR 0054). It reads as it
   * did when the programme ended, and can no longer be logged, skipped, put back or moved.
   */
  closed: boolean;
  loggable: boolean;
};

/**
 * An occurrence with the slot of the cycle it belongs to, for the views that read it the way
 * the programme runs: by where the sequence has got to, not by its date. Both are null for
 * standalone work and for programme work no slot owns.
 */
export type ProgrammeOccurrence = ScheduledOccurrence & {
  cycleIndex: number | null;
  cycleDayIndex: number | null;
};

const columns = {
  id: plannedOccurrences.id,
  sport: plannedOccurrences.sport,
  disposition: plannedOccurrences.disposition,
  familyId: plannedOccurrences.familyId,
  originalWeekIndex: plannedOccurrences.originalWeekIndex,
  originalScheduledOn: plannedOccurrences.originalScheduledOn,
  cycleIndex: plannedOccurrences.cycleIndex,
  cycleDayIndex: plannedOccurrences.cycleDayIndex,
  revisionId: occurrenceVersions.id,
  scheduledOn: occurrenceVersions.scheduledOn,
  scheduledLocalTime: occurrenceVersions.scheduledLocalTime,
  orderIndex: occurrenceVersions.orderIndex,
  prescription: occurrenceVersions.prescription,
  activityId: activities.id,
  activityOutcome: activities.outcome,
  activityOccurredOn: activities.occurredOn,
  /** The family of the athlete's programme now, if they have one, from the left join below. */
  activeFamilyId: programs.familyId,
};

type Row = {
  [K in keyof typeof columns]: (typeof columns)[K] extends { _: { data: infer T } } ? T : never;
};

function hydrate(row: Row): ProgrammeOccurrence {
  const activity = row.activityId
    ? { id: row.activityId, outcome: row.activityOutcome!, occurredOn: row.activityOccurredOn! }
    : null;
  const resolution = resolveOccurrence({ disposition: row.disposition }, activity);
  const owner = { disposition: row.disposition, programFamilyId: row.familyId };
  const activeFamilyId = row.activeFamilyId ?? null;
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
    cycleIndex: row.cycleIndex,
    cycleDayIndex: row.cycleDayIndex,
    resolution,
    closed: programmeClosed(owner, activeFamilyId),
    loggable: canLog(owner, activity, activeFamilyId),
  };
}

/**
 * How one day's sessions are ordered: by the time somebody gave them, then the order the
 * programme wrote them in. A session without a time follows the timed ones, and the id only
 * settles a true tie, so the same day reads the same way every time it is opened.
 */
const withinDay = [
  sql`${occurrenceVersions.scheduledLocalTime} asc nulls last`,
  asc(occurrenceVersions.orderIndex),
  asc(plannedOccurrences.id),
];

/**
 * The base query: an occurrence, the revision in force, the activity that answered it, and the
 * athlete's programme now — one row at most, as only one programme is ever active — which says
 * whether the programme it was written for is still theirs.
 */
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
    .leftJoin(
      programs,
      and(
        eq(programs.userId, plannedOccurrences.userId),
        eq(programs.familyId, plannedOccurrences.familyId),
        eq(programs.status, "active"),
      ),
    )
    .where(eq(plannedOccurrences.userId, userId))
    .$dynamic();
}

export async function getOccurrence(
  tx: DbOrTx,
  userId: string,
  occurrenceId: string,
): Promise<ProgrammeOccurrence | null> {
  const rows = await occurrenceQuery(tx, userId).where(
    and(eq(plannedOccurrences.userId, userId), eq(plannedOccurrences.id, occurrenceId)),
  );
  const row = rows[0] as Row | undefined;
  return row ? hydrate(row) : null;
}

/** Exact calendar date, across all active programme families and standalone scheduling. */
export async function occurrencesOnDate(
  tx: DbOrTx,
  userId: string,
  date: string,
  sport?: ActivitySport,
): Promise<ProgrammeOccurrence[]> {
  const rows = await occurrenceQuery(tx, userId)
    .where(
      and(
        eq(plannedOccurrences.userId, userId),
        eq(occurrenceVersions.scheduledOn, date),
        sport ? eq(plannedOccurrences.sport, sport) : undefined,
      ),
    )
    .orderBy(...withinDay);
  return (rows as Row[]).map(hydrate).filter((row) => !row.closed);
}

/**
 * Exactly what the athlete put on the calendar for that date, and nothing the programme
 * placed there.
 *
 * Today asks for these by date because that is what they are: a date the athlete chose. The
 * programme's own work is asked for by where the sequence has got to instead — a programme
 * that shifts when a day is missed cannot also hand out the dates it was first written with
 * (plan §2.3).
 */
export async function standaloneOccurrencesOnDate(
  tx: DbOrTx,
  userId: string,
  date: string,
): Promise<ScheduledOccurrence[]> {
  const rows = (await occurrenceQuery(tx, userId)
    .where(
      and(
        eq(plannedOccurrences.userId, userId),
        eq(occurrenceVersions.scheduledOn, date),
        sql`${plannedOccurrences.familyId} is null`,
      ),
    )
    .orderBy(...withinDay)) as Row[];
  return rows.map(hydrate);
}

/**
 * The programme's endurance work for one slot of the cycle.
 *
 * Found by the slot of the cycle it belongs to and the cycle it is in, never by its date: the
 * slot is where the sequence has got to, and the date on the row is where the block was first
 * written to put it. Falling two days behind moves the run with the workout it shares a day
 * with, instead of handing today a session from a day nobody has reached yet.
 *
 * `cycleDayIndex` is read from the row rather than worked out from the offered day's weekday.
 * A weekday identifies nothing here — a lifting day can share one with a running day, and a
 * cycle longer than a week must repeat them — and while this asked by weekday it answered a
 * pull-up day with somebody's easy run. An occurrence that belongs to no slot is returned by
 * no slot.
 */
export async function occurrencesForSlot(
  tx: DbOrTx,
  userId: string,
  slot: { familyId: string; cycleDayIndex: number; cycleIndex: number },
): Promise<ScheduledOccurrence[]> {
  const rows = (await occurrenceQuery(tx, userId)
    .where(
      and(
        eq(plannedOccurrences.userId, userId),
        eq(plannedOccurrences.familyId, slot.familyId),
        eq(plannedOccurrences.cycleDayIndex, slot.cycleDayIndex),
        eq(plannedOccurrences.cycleIndex, slot.cycleIndex),
      ),
    )
    .orderBy(...withinDay)) as Row[];
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
    .orderBy(asc(occurrenceVersions.scheduledOn), ...withinDay)) as Row[];
  return splitByDate(rows.map(hydrate), today);
}

/** The same outstanding upcoming work as standaloneSchedule, without loading its history. */
export async function countUpcomingStandalone(
  tx: DbOrTx,
  userId: string,
  today: string,
): Promise<number> {
  const [row] = await tx
    .select({ value: sql<number>`count(*)::int` })
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
    .where(
      and(
        eq(plannedOccurrences.userId, userId),
        isNull(plannedOccurrences.familyId),
        gte(occurrenceVersions.scheduledOn, today),
        eq(plannedOccurrences.disposition, "pending"),
        isNull(activities.id),
      ),
    );
  return row?.value ?? 0;
}

/** A programme's occurrences, for the Programme view that owns the full programme. */
export async function programmeOccurrences(
  tx: DbOrTx,
  userId: string,
  familyId: string,
  options: { sport?: ActivitySport; from?: string; to?: string } = {},
): Promise<ProgrammeOccurrence[]> {
  const where = [eq(plannedOccurrences.userId, userId), eq(plannedOccurrences.familyId, familyId)];
  if (options.sport) where.push(eq(plannedOccurrences.sport, options.sport));
  if (options.from) where.push(gte(occurrenceVersions.scheduledOn, options.from));
  if (options.to) where.push(lt(occurrenceVersions.scheduledOn, options.to));
  const rows = (await occurrenceQuery(tx, userId)
    .where(and(...where))
    .orderBy(asc(occurrenceVersions.scheduledOn), ...withinDay)) as Row[];
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

/**
 * The occurrence, refused when its programme is no longer the athlete's (ADR 0054): skipping,
 * putting back or moving a session of a block they have moved on from would rewrite that
 * block's record, and putting one back or moving it would owe it again.
 */
async function requireOpenOccurrence(
  tx: DbOrTx,
  userId: string,
  occurrenceId: string,
): Promise<ScheduledOccurrence> {
  const occurrence = await requireOccurrence(tx, userId, occurrenceId);
  if (occurrence.closed) throw new OccurrenceClosedError();
  return occurrence;
}

/** Marks one occurrence skipped. Its neighbours, its day and its sport are untouched. */
export async function skipOccurrence(
  tx: DbOrTx,
  userId: string,
  occurrenceId: string,
  note?: string,
): Promise<void> {
  const occurrence = await requireOpenOccurrence(tx, userId, occurrenceId);
  if (!occurrence.loggable) throw new OccurrenceNotFoundError();
  if (occurrence.disposition === "skipped") return;
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

/**
 * Skips the run half of one day of the programme: each of the day's sessions still owed, as
 * Today's skip and "Pick up from today" skip a day (ADR 0051). One that was logged, skipped or
 * withdrawn already keeps its answer. Each stays loggable, and logging it replaces the skip.
 *
 * Null when the day has no occurrence at all, which only a day whose runs predate occurrences
 * can be: then the day itself is the only place its skip can be recorded (`skipSlotPart`).
 */
export async function skipSlotOccurrences(
  tx: DbOrTx,
  userId: string,
  slot: { familyId: string; cycleIndex: number; cycleDayIndex: number },
  details: { occurredOn: string; note?: string | null },
): Promise<number | null> {
  const owned = (await occurrencesForSlot(tx, userId, slot)).filter(
    (occurrence) => occurrence.sport !== "strength",
  );
  if (owned.length === 0) return null;
  const owed = owned
    .filter((occurrence) => occurrence.resolution.kind === "incomplete")
    .map((occurrence) => occurrence.id);
  if (owed.length === 0) return 0;
  const skipped = await tx
    .update(plannedOccurrences)
    .set({ disposition: "skipped", updatedAt: new Date() })
    .where(
      and(
        eq(plannedOccurrences.userId, userId),
        inArray(plannedOccurrences.id, owed),
        eq(plannedOccurrences.disposition, "pending"),
      ),
    )
    .returning({ id: plannedOccurrences.id });
  if (skipped.length === 0) return 0;
  // Said where it came from, so the session's own history tells this skip from one made on
  // its page: the day was skipped, with the reason given for the day.
  await tx.insert(occurrenceEvents).values(
    skipped.map(({ id }) => ({
      userId,
      occurrenceId: id,
      kind: "skipped" as const,
      actor: "athlete",
      occurredOn: details.occurredOn,
      detail: { via: "today", ...(details.note ? { note: details.note } : {}) },
    })),
  );
  return skipped.length;
}

/** Undoing a skip restores that same occurrence; it never creates a second one. */
export async function reopenOccurrence(
  tx: DbOrTx,
  userId: string,
  occurrenceId: string,
): Promise<void> {
  const occurrence = await requireOpenOccurrence(tx, userId, occurrenceId);
  if (occurrence.resolution.kind === "incomplete") return;
  if (occurrence.resolution.kind !== "skipped" && occurrence.resolution.kind !== "legacy_completed")
    throw new OccurrenceNotFoundError();
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
 * Takes a session the athlete put on the calendar off it again.
 *
 * Only standalone work, and only while nothing has answered it: a programme's sessions change
 * when the programme does, and a logged one belongs to its activity, which is deleted on its
 * own page. The row stays, cancelled, beside the event that says who removed it, so nothing
 * that ever pointed at it is left pointing at nothing.
 */
export async function removeStandaloneOccurrence(
  tx: DbOrTx,
  userId: string,
  occurrenceId: string,
): Promise<void> {
  const occurrence = await requireOccurrence(tx, userId, occurrenceId);
  if (occurrence.familyId !== null || !occurrence.loggable) throw new OccurrenceNotFoundError();
  await tx
    .update(plannedOccurrences)
    .set({ disposition: "cancelled", updatedAt: new Date() })
    .where(and(eq(plannedOccurrences.userId, userId), eq(plannedOccurrences.id, occurrenceId)));
  await tx.insert(occurrenceEvents).values({
    userId,
    occurrenceId,
    kind: "cancelled",
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
  const occurrence = await requireOpenOccurrence(tx, userId, occurrenceId);
  if (!occurrence.loggable) throw new OccurrenceNotFoundError();
  const [current] = await tx
    .select()
    .from(occurrenceVersions)
    .where(
      and(eq(occurrenceVersions.userId, userId), eq(occurrenceVersions.id, occurrence.revisionId)),
    )
    .limit(1);
  if (!current) throw new OccurrenceNotFoundError();
  if (
    current.scheduledOn === scheduledOn &&
    (options.scheduledLocalTime === undefined ||
      options.scheduledLocalTime === current.scheduledLocalTime) &&
    (options.orderIndex === undefined || options.orderIndex === current.orderIndex)
  )
    return { revisionId: current.id };
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
  const occurrence = await requireOpenOccurrence(tx, userId, occurrenceId);
  if (!occurrence.loggable) throw new OccurrenceNotFoundError();
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

export type NamedOccurrence = {
  id: string;
  sport: ActivitySport;
  scheduledOn: string;
  /** Null for work the athlete put on the calendar themselves. */
  familyId: string | null;
  cycleIndex: number | null;
  /** The programme day it belongs to, as the version that wrote it names that day. */
  dayName: string | null;
  /** That day's focus ("Zone 2"), from the same version. */
  dayFocus: string | null;
  /**
   * Its programme is no longer the athlete's (ADR 0054): the activity that answered it is the
   * last that can, and deleting that activity leaves the session unlogged for good.
   */
  closed: boolean;
};

/**
 * One occurrence, named the way its programme names it: "Tempo run" of cycle 6, planned for
 * Thursday. An activity that answered it says which session it was by this, rather than that
 * it answered "a scheduled session". The day is read from the programme version the revision
 * in force was written by, so a session of a block since replaced keeps its own day's name.
 */
export async function namedOccurrence(
  tx: DbOrTx,
  userId: string,
  occurrenceId: string,
): Promise<NamedOccurrence | null> {
  const [row] = await tx
    .select({
      id: plannedOccurrences.id,
      sport: plannedOccurrences.sport,
      scheduledOn: occurrenceVersions.scheduledOn,
      familyId: plannedOccurrences.familyId,
      cycleIndex: plannedOccurrences.cycleIndex,
      // Plain SQL, qualified by hand: inside a select list Drizzle drops table qualifiers.
      dayName: sql<string | null>`(
        select d.name from program_days d
        where d.program_id = occurrence_versions.program_version_id
          and d.user_id = planned_occurrences.user_id
          and d.day_index = planned_occurrences.cycle_day_index
        limit 1
      )`,
      dayFocus: sql<string | null>`(
        select d.focus from program_days d
        where d.program_id = occurrence_versions.program_version_id
          and d.user_id = planned_occurrences.user_id
          and d.day_index = planned_occurrences.cycle_day_index
        limit 1
      )`,
      // The athlete's programme now, as the base query joins it: one row at most.
      activeFamilyId: programs.familyId,
    })
    .from(plannedOccurrences)
    .innerJoin(
      occurrenceVersions,
      and(
        eq(occurrenceVersions.id, plannedOccurrences.currentRevisionId),
        eq(occurrenceVersions.userId, plannedOccurrences.userId),
      ),
    )
    .leftJoin(
      programs,
      and(
        eq(programs.userId, plannedOccurrences.userId),
        eq(programs.familyId, plannedOccurrences.familyId),
        eq(programs.status, "active"),
      ),
    )
    .where(and(eq(plannedOccurrences.userId, userId), eq(plannedOccurrences.id, occurrenceId)))
    .limit(1);
  if (!row) return null;
  const { activeFamilyId, ...named } = row;
  return {
    ...named,
    closed: programmeClosed({ programFamilyId: row.familyId }, activeFamilyId ?? null),
  };
}

export type ProgrammeClosure = {
  /** The programme the session was written for, as its last version names it. */
  name: string;
  /** The athlete's day it stopped being their programme. */
  closedOn: string;
  /**
   * The programme the athlete started that day, which took its place, or null when it was
   * archived alone. Not said to have replaced it: the one before may have finished long since.
   */
  followedBy: string | null;
};

/**
 * How the programme a closed session belongs to stopped being the athlete's (ADR 0054): which
 * programme took its place and on what day, or the day it was archived with nothing in its
 * place. Null while the family is still the athlete's programme, or names nothing they own.
 *
 * Read from the programme rows, not stored at the switch. Its last version was archived when it
 * stopped (`updated_at`, which nothing else writes once a version is archived), and the next
 * programme of another family started after that version is what followed it. That one took its
 * place when it started on the day it was archived, as starting a programme archives the one
 * before; started on a later day, it followed a programme that had been archived on its own.
 */
export async function programmeClosure(
  tx: DbOrTx,
  userId: string,
  familyId: string,
  timeZone: string,
): Promise<ProgrammeClosure | null> {
  const [last] = await tx
    .select({
      name: programs.name,
      status: programs.status,
      createdAt: programs.createdAt,
      updatedAt: programs.updatedAt,
    })
    .from(programs)
    .where(
      and(
        eq(programs.userId, userId),
        eq(programs.familyId, familyId),
        ne(programs.status, "draft"),
      ),
    )
    .orderBy(desc(programs.createdAt), desc(programs.version))
    .limit(1);
  if (!last || last.status === "active") return null;
  const [next] = await tx
    .select({ name: programs.name, createdAt: programs.createdAt })
    .from(programs)
    .where(
      and(
        eq(programs.userId, userId),
        ne(programs.familyId, familyId),
        ne(programs.status, "draft"),
        gte(programs.createdAt, last.createdAt),
      ),
    )
    .orderBy(asc(programs.createdAt))
    .limit(1);
  const closedOn = todayInTimeZone(timeZone, last.updatedAt);
  return {
    name: last.name,
    closedOn,
    followedBy: next && todayInTimeZone(timeZone, next.createdAt) <= closedOn ? next.name : null,
  };
}
