import { and, asc, desc, eq, gte, lt, lte, or, sql } from "drizzle-orm";

import {
  activities,
  cyclingActivityDetails,
  plannedOccurrences,
  occurrenceVersions,
  runningActivityDetails,
  swimmingActivityDetails,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { ACTIVITY_SPORTS, type ActivitySport } from "@/domain/activity";
import { adherenceBySport, resolveOccurrence } from "@/domain/occurrences";
import type { AdherenceCounts } from "@/domain/occurrences";

/**
 * What the four sports add up to (plan §9.1).
 *
 * Two rules run through everything here, and they are the reason this is SQL rather than a
 * fold over a page of rows. The first: a total is computed over the whole period, never over
 * whatever a list happened to show. History's 200-row cap and the coach's 500-row reader are
 * display limits, and a display limit that becomes a lifetime total is a lie with a plausible
 * shape (§9.1, AT-STAT-02).
 *
 * The second: what is unknown is counted, not guessed. A ride with no distance contributes to
 * the count and to the recorded time and to nothing else; the number of such rides travels
 * with the total so a reader can see what the total is missing. Zero and unknown never merge.
 *
 * And nothing is added across sports that does not mean the same thing in both. Counts, days
 * and recorded duration are common. Distance is per sport, because a kilometre swum and a
 * kilometre ridden are not interchangeable, and tonnage is strength's alone.
 */

export type SportTotals = {
  sport: ActivitySport;
  /** Activities in the period. */
  count: number;
  /** Distinct local dates with at least one activity of this sport. */
  days: number;
  /** Recorded training time, not unique wall-clock time: overlapping sessions can mislead. */
  durationMs: number;
  /** How many of those activities recorded no duration at all. */
  unknownDurations: number;
  /** Canonical metres, for the sports that measure one. Null where none was recorded. */
  distanceMetres: number | null;
  /** Activities of this sport whose distance is unknown, which the total excludes. */
  unknownDistances: number;
  /** The longest single session by distance and by duration. Conservative, whole-session. */
  longestDistanceMetres: number | null;
  longestDurationMs: number | null;
  /** How many carry an effort the athlete actually reported (LOG-03). */
  reportedEfforts: number;
  unconfirmedEfforts: number;
  unknownEfforts: number;
};

export type TotalsCoverage = {
  from: string;
  /** Inclusive, like the local dates it is compared against. */
  to: string;
  /** True when every activity in the period was counted, which SQL totals always are. */
  complete: true;
};

export type ActivityTotals = {
  coverage: TotalsCoverage;
  bySport: SportTotals[];
  /** Distinct training days across every sport: a day with a ride and a lift counts once. */
  trainingDays: number;
  activities: number;
};

const EMPTY = (sport: ActivitySport): SportTotals => ({
  sport,
  count: 0,
  days: 0,
  durationMs: 0,
  unknownDurations: 0,
  distanceMetres: null,
  unknownDistances: 0,
  longestDistanceMetres: null,
  longestDurationMs: null,
  reportedEfforts: 0,
  unconfirmedEfforts: 0,
  unknownEfforts: 0,
});

/**
 * The distance of an activity, in canonical metres, whatever sport it is.
 *
 * A left join per sport rather than a union: a strength session has no distance and must not
 * acquire one, and a ride whose distance is unknown must stay unknown rather than becoming
 * zero. The coalesce chain picks the one detail table that exists, never a default.
 *
 * A length-counted swim stores no asserted distance, because the lengths and the pool are the
 * authority and a second stored number could disagree with them (SWIM-01). The same
 * arithmetic the form does is done here — lengths times the pool's own metres — rather than
 * treating the null as "no distance": sixteen lengths of a 25 m pool is 400 m on every screen
 * that reads it.
 */
const SWIM_DISTANCE = sql<number | null>`coalesce(
  ${swimmingActivityDetails.distanceMetres},
  ${swimmingActivityDetails.lengths} * ${swimmingActivityDetails.poolLengthMetres}
)`;

const DISTANCE = sql<number | null>`coalesce(
  ${runningActivityDetails.distanceMetres},
  ${cyclingActivityDetails.distanceMetres},
  ${SWIM_DISTANCE}
)`;

/**
 * Per-sport totals for a period, computed in full.
 *
 * `from` and `to` are local dates and both inclusive, matching how the athlete reads their own
 * calendar. Omitting them reads everything, which is what a lifetime total means.
 */
export async function readActivityTotals(
  tx: DbOrTx,
  userId: string,
  range: { from?: string; to?: string } = {},
): Promise<ActivityTotals> {
  const where = [eq(activities.userId, userId), eq(activities.status, "completed")];
  if (range.from) where.push(gte(activities.occurredOn, range.from));
  if (range.to) where.push(lte(activities.occurredOn, range.to));

  const rows = await tx
    .select({
      sport: activities.sport,
      count: sql<number>`count(*)::int`,
      days: sql<number>`count(distinct ${activities.occurredOn})::int`,
      durationMs: sql<string>`coalesce(sum(${activities.durationMs}), 0)::bigint`,
      unknownDurations: sql<number>`count(*) filter (where ${activities.durationMs} is null)::int`,
      distanceMetres: sql<string | null>`sum(${DISTANCE})::numeric`,
      // Strength has no distance to be missing; only a sport that measures one can lack it.
      unknownDistances: sql<number>`count(*) filter (
        where ${activities.sport} <> 'strength' and ${DISTANCE} is null
      )::int`,
      longestDistanceMetres: sql<string | null>`max(${DISTANCE})::numeric`,
      longestDurationMs: sql<string | null>`max(${activities.durationMs})::bigint`,
      reportedEfforts: sql<number>`count(*) filter (where ${activities.effortStatus} = 'reported')::int`,
      unconfirmedEfforts: sql<number>`count(*) filter (where ${activities.effortStatus} = 'legacy_unconfirmed')::int`,
      unknownEfforts: sql<number>`count(*) filter (where ${activities.effortStatus} = 'unknown')::int`,
    })
    .from(activities)
    .leftJoin(runningActivityDetails, eq(runningActivityDetails.activityId, activities.id))
    .leftJoin(cyclingActivityDetails, eq(cyclingActivityDetails.activityId, activities.id))
    .leftJoin(swimmingActivityDetails, eq(swimmingActivityDetails.activityId, activities.id))
    .where(and(...where))
    .groupBy(activities.sport);

  const [overall] = await tx
    .select({
      trainingDays: sql<number>`count(distinct ${activities.occurredOn})::int`,
      activities: sql<number>`count(*)::int`,
    })
    .from(activities)
    .where(and(...where));

  const bySport = ACTIVITY_SPORTS.map((sport) => {
    const row = rows.find((candidate) => candidate.sport === sport);
    if (!row) return EMPTY(sport);
    return {
      sport,
      count: row.count,
      days: row.days,
      durationMs: Number(row.durationMs),
      unknownDurations: row.unknownDurations,
      distanceMetres: row.distanceMetres === null ? null : Number(row.distanceMetres),
      unknownDistances: row.unknownDistances,
      longestDistanceMetres:
        row.longestDistanceMetres === null ? null : Number(row.longestDistanceMetres),
      longestDurationMs: row.longestDurationMs === null ? null : Number(row.longestDurationMs),
      reportedEfforts: row.reportedEfforts,
      unconfirmedEfforts: row.unconfirmedEfforts,
      unknownEfforts: row.unknownEfforts,
    };
  });

  return {
    coverage: { from: range.from ?? "", to: range.to ?? "", complete: true },
    bySport,
    trainingDays: overall?.trainingDays ?? 0,
    activities: overall?.activities ?? 0,
  };
}

export type ActivityListItem = {
  id: string;
  sport: ActivitySport;
  startedAt: Date;
  occurredOn: string;
  durationMs: number | null;
  distanceMetres: number | null;
  effortValue: number | null;
  effortStatus: "reported" | "unknown" | "legacy_unconfirmed";
  title: string | null;
  occurrenceId: string | null;
  performedRevisionId: string | null;
  environment: string | null;
};

export type ActivityPage = {
  items: ActivityListItem[];
  /** Timestamp and id, so ties on one instant cannot omit or repeat a row (AT-API-04). */
  nextCursor: string | null;
};

const CURSOR = /^(-?\d+):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function encodeCursor(item: { startedAt: Date; id: string }): string {
  return `${item.startedAt.getTime()}:${item.id}`;
}

export function decodeCursor(raw: string): { startedAt: Date; id: string } | null {
  const match = CURSOR.exec(raw);
  if (!match) return null;
  const at = Number(match[1]);
  if (!Number.isSafeInteger(at)) return null;
  const startedAt = new Date(at);
  if (!Number.isFinite(startedAt.getTime())) return null;
  return { startedAt, id: match[2]! };
}

/**
 * One page of history, newest first, paged by a stable cursor.
 *
 * Two activities can share an instant — a backdated pair entered together — so the cursor
 * carries the id as well. Paging on the timestamp alone silently drops one of them, which is
 * precisely the kind of loss an export cannot afford (AT-API-04).
 */
export async function listActivityPage(
  tx: DbOrTx,
  userId: string,
  options: {
    sports?: readonly ActivitySport[];
    from?: string;
    to?: string;
    limit?: number;
    cursor?: string | null;
  } = {},
): Promise<ActivityPage> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const where = [eq(activities.userId, userId), eq(activities.status, "completed")];
  if (options.sports && options.sports.length > 0)
    where.push(or(...options.sports.map((sport) => eq(activities.sport, sport)))!);
  if (options.from) where.push(gte(activities.occurredOn, options.from));
  if (options.to) where.push(lte(activities.occurredOn, options.to));
  if (options.cursor) {
    const cursor = decodeCursor(options.cursor);
    if (!cursor) throw new InvalidCursorError();
    where.push(
      or(
        lt(activities.startedAt, cursor.startedAt),
        and(eq(activities.startedAt, cursor.startedAt), lt(activities.id, cursor.id)),
      )!,
    );
  }

  const rows = await tx
    .select({
      id: activities.id,
      sport: activities.sport,
      startedAt: activities.startedAt,
      occurredOn: activities.occurredOn,
      durationMs: activities.durationMs,
      effortValue: activities.effortValue,
      effortStatus: activities.effortStatus,
      title: activities.title,
      occurrenceId: activities.occurrenceId,
      performedRevisionId: activities.performedRevisionId,
      distanceMetres: DISTANCE,
      environment: sql<string | null>`coalesce(
        ${runningActivityDetails.environment}::text,
        ${cyclingActivityDetails.environment}::text,
        ${swimmingActivityDetails.environment}::text
      )`,
    })
    .from(activities)
    .leftJoin(runningActivityDetails, eq(runningActivityDetails.activityId, activities.id))
    .leftJoin(cyclingActivityDetails, eq(cyclingActivityDetails.activityId, activities.id))
    .leftJoin(swimmingActivityDetails, eq(swimmingActivityDetails.activityId, activities.id))
    .where(and(...where))
    .orderBy(desc(activities.startedAt), desc(activities.id))
    .limit(limit + 1);

  const items = rows.slice(0, limit).map((row) => ({
    ...row,
    distanceMetres: row.distanceMetres === null ? null : Number(row.distanceMetres),
  }));
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
  };
}

export class InvalidCursorError extends Error {
  constructor() {
    super("That page cursor is not one this endpoint issued.");
    this.name = "InvalidCursorError";
  }
}

export type SportAdherence = { sport: ActivitySport; counts: AdherenceCounts };

/**
 * Adherence, per sport, against the occurrence each activity actually answered.
 *
 * Counted on the original obligation rather than on the date it was eventually done: a
 * Wednesday swim logged on Friday is Wednesday's swim, completed (SCHED-04). Strength is
 * counted over strength's own occurrences alone, which is the correction this release makes
 * on purpose — an unfinished run no longer makes a completed workout look missed (§9.1).
 */
export async function readAdherence(
  tx: DbOrTx,
  userId: string,
  range: { from?: string; to?: string } = {},
): Promise<SportAdherence[]> {
  const where = [eq(plannedOccurrences.userId, userId)];
  if (range.from) where.push(gte(occurrenceVersions.scheduledOn, range.from));
  if (range.to) where.push(lte(occurrenceVersions.scheduledOn, range.to));
  const rows = await tx
    .select({
      sport: plannedOccurrences.sport,
      disposition: plannedOccurrences.disposition,
      activityId: activities.id,
      outcome: activities.outcome,
      occurredOn: activities.occurredOn,
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
      activities,
      and(
        eq(activities.occurrenceId, plannedOccurrences.id),
        eq(activities.userId, plannedOccurrences.userId),
      ),
    )
    .where(and(...where));

  const entries = rows.map((row) => ({
    sport: row.sport,
    resolution: resolveOccurrence(
      { disposition: row.disposition },
      row.activityId
        ? { id: row.activityId, outcome: row.outcome!, occurredOn: row.occurredOn! }
        : null,
    ),
  }));
  const bySport = adherenceBySport(entries);
  return ACTIVITY_SPORTS.flatMap((sport) =>
    bySport[sport] ? [{ sport, counts: bySport[sport]! }] : [],
  );
}

export type ComparableBest = {
  sport: ActivitySport;
  /** The context these are comparable within; unknown context is excluded entirely. */
  context: string;
  longestDistanceMetres: number | null;
  longestDurationMs: number | null;
  activityCount: number;
};

/**
 * Conservative whole-session bests, inside a context that makes them comparable (§9.1).
 *
 * An indoor ride and an outdoor one are separate rows, and so are an assisted ride and an
 * unassisted one, and a 25 m pool and a 25 yd pool. Anything whose context was not recorded
 * is counted in the totals above and excluded from here, because a best is a claim about
 * performance and a claim needs to know what it is comparing.
 *
 * No segment records, no estimated power, no stroke efficiency. A session total is the whole
 * of what was measured, and pretending otherwise would be inventing the measurement.
 */
export async function readComparableBests(
  tx: DbOrTx,
  userId: string,
  range: { from?: string; to?: string } = {},
): Promise<ComparableBest[]> {
  const bounds = (column: typeof activities.occurredOn) => {
    const where = [eq(activities.userId, userId), eq(activities.status, "completed")];
    if (range.from) where.push(gte(column, range.from));
    if (range.to) where.push(lte(column, range.to));
    return where;
  };

  const [running, cycling, swimming] = await Promise.all([
    tx
      .select({
        context: sql<string>`${runningActivityDetails.environment}::text`,
        longestDistanceMetres: sql<
          string | null
        >`max(${runningActivityDetails.distanceMetres})::numeric`,
        longestDurationMs: sql<string | null>`max(${activities.durationMs})::bigint`,
        activityCount: sql<number>`count(*)::int`,
      })
      .from(activities)
      .innerJoin(runningActivityDetails, eq(runningActivityDetails.activityId, activities.id))
      .where(and(...bounds(activities.occurredOn), eq(activities.sport, "running")))
      .groupBy(runningActivityDetails.environment),
    tx
      .select({
        context: sql<string>`${cyclingActivityDetails.environment}::text || ' · ' || ${cyclingActivityDetails.assistance}::text`,
        longestDistanceMetres: sql<
          string | null
        >`max(${cyclingActivityDetails.distanceMetres})::numeric`,
        longestDurationMs: sql<string | null>`max(${activities.durationMs})::bigint`,
        activityCount: sql<number>`count(*)::int`,
      })
      .from(activities)
      .innerJoin(cyclingActivityDetails, eq(cyclingActivityDetails.activityId, activities.id))
      .where(
        and(
          ...bounds(activities.occurredOn),
          eq(activities.sport, "cycling"),
          // Unknown assistance is not a context: an e-bike's distance is not a rider's.
          sql`${cyclingActivityDetails.assistance} <> 'unknown'`,
        ),
      )
      .groupBy(cyclingActivityDetails.environment, cyclingActivityDetails.assistance),
    tx
      .select({
        context: sql<string>`${swimmingActivityDetails.environment}::text || coalesce(' · ' || ${swimmingActivityDetails.poolLengthMetres}::text || ' m pool', '')`,
        longestDistanceMetres: sql<string | null>`max(${SWIM_DISTANCE})::numeric`,
        longestDurationMs: sql<string | null>`max(${activities.durationMs})::bigint`,
        activityCount: sql<number>`count(*)::int`,
      })
      .from(activities)
      .innerJoin(swimmingActivityDetails, eq(swimmingActivityDetails.activityId, activities.id))
      .where(
        and(
          ...bounds(activities.occurredOn),
          eq(activities.sport, "swimming"),
          // A pool swim with no recorded length cannot be compared with another pool swim.
          or(
            sql`${swimmingActivityDetails.environment} = 'open_water'`,
            sql`${swimmingActivityDetails.poolLengthMetres} is not null`,
          )!,
        ),
      )
      .groupBy(swimmingActivityDetails.environment, swimmingActivityDetails.poolLengthMetres),
  ]);

  const shape = (sport: ActivitySport) => (row: (typeof running)[number]) => ({
    sport,
    context: row.context,
    longestDistanceMetres:
      row.longestDistanceMetres === null ? null : Number(row.longestDistanceMetres),
    longestDurationMs: row.longestDurationMs === null ? null : Number(row.longestDurationMs),
    activityCount: row.activityCount,
  });
  return [
    ...running.map(shape("running")),
    ...cycling.map(shape("cycling")),
    ...swimming.map(shape("swimming")),
  ];
}

/**
 * Recorded training time per local week, for the shape of a block.
 *
 * Labelled as recorded time rather than as a workload score. Overlapping sessions and
 * unrecorded durations both exist, so a number here says how much was written down, not how
 * much training happened (§9.1).
 */
export async function readWeeklyActivityVolume(
  tx: DbOrTx,
  userId: string,
  range: { from: string; to: string },
): Promise<
  {
    weekStart: string;
    sport: ActivitySport;
    count: number;
    durationMs: number;
    distanceMetres: number | null;
  }[]
> {
  const rows = await tx
    .select({
      weekStart: sql<string>`to_char(date_trunc('week', ${activities.occurredOn}::date), 'YYYY-MM-DD')`,
      sport: activities.sport,
      count: sql<number>`count(*)::int`,
      durationMs: sql<string>`coalesce(sum(${activities.durationMs}), 0)::bigint`,
      distanceMetres: sql<string | null>`sum(${DISTANCE})::numeric`,
    })
    .from(activities)
    .leftJoin(runningActivityDetails, eq(runningActivityDetails.activityId, activities.id))
    .leftJoin(cyclingActivityDetails, eq(cyclingActivityDetails.activityId, activities.id))
    .leftJoin(swimmingActivityDetails, eq(swimmingActivityDetails.activityId, activities.id))
    .where(
      and(
        eq(activities.userId, userId),
        eq(activities.status, "completed"),
        gte(activities.occurredOn, range.from),
        lte(activities.occurredOn, range.to),
      ),
    )
    .groupBy(sql`1`, activities.sport)
    .orderBy(asc(sql`1`), asc(activities.sport));
  return rows.map((row) => ({
    weekStart: row.weekStart,
    sport: row.sport,
    count: row.count,
    durationMs: Number(row.durationMs),
    distanceMetres: row.distanceMetres === null ? null : Number(row.distanceMetres),
  }));
}
