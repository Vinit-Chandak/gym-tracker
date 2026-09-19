import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, notInArray, sql } from "drizzle-orm";

import {
  activities,
  cyclingActivityDetails,
  exercises,
  profileDirectory,
  profiles,
  sharedBodyWeight,
  sharedExerciseStats,
  sharedSessionStats,
  swimmingActivityDetails,
  userSportPreferences,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { ActivitySport } from "@/domain/activity";
import { activityValue, type ActivityMetric } from "@/domain/leaderboard";
import { addMuscleSets, type MuscleSets } from "@/domain/muscle-split";
import { regionOf, type BodyRegion } from "@/domain/muscles";
import { detectRecords, type PreviousMaxima, type TrainingRecord } from "@/domain/records";
import {
  enduranceStats,
  metricValue,
  primaryMetric,
  runStats,
  SHARED_METRICS,
  sessionStats,
  type MetricExercise,
  type SharedMetric,
  type StatsEnduranceSession,
  type StatsRun,
  type StatsWorkout,
} from "@/domain/shared-stats";
import type { TrainingSport } from "@/domain/sport-scope";
import type { DateRange } from "@/server/validation/date-range";

import type { BodyWeightReading } from "./body-weight";

/**
 * The shared tables (ADR 0026). Every function names the user ids it reads; the policies —
 * `can_view_training(user_id)` on the two stats tables, `can_view_body_weight(user_id)` on
 * the reading — are the guarantee, not the filter. Writes are the owner's, inside the same
 * transaction as the session, run or reading they describe.
 */

/** The account's own time zone: every civil date in a shared row is resolved in it. */
async function ownerTimeZone(tx: DbOrTx, userId: string): Promise<string> {
  const [row] = await tx
    .select({ timeZone: profiles.timeZone })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return row?.timeZone ?? "UTC";
}

/** The best the owner had done per exercise and metric before `startedAt`. */
async function previousMaxima(
  tx: DbOrTx,
  userId: string,
  exerciseIds: readonly string[],
  startedAt: Date,
): Promise<PreviousMaxima> {
  const maxima = new Map<string, Partial<Record<SharedMetric, number>>>();
  if (exerciseIds.length === 0) return maxima;
  const rows = await tx
    .select({
      exerciseId: sharedExerciseStats.exerciseId,
      bestE1rmKg: sql<number | null>`max(${sharedExerciseStats.bestE1rmKg})::float8`,
      topWeightKg: sql<number | null>`max(${sharedExerciseStats.topWeightKg})::float8`,
      bestSetVolumeKg: sql<number | null>`max(${sharedExerciseStats.bestSetVolumeKg})::float8`,
      mostReps: sql<number | null>`max(${sharedExerciseStats.mostReps})::int`,
      longestDurationSeconds: sql<
        number | null
      >`max(${sharedExerciseStats.longestDurationSeconds})::int`,
      longestDistanceMeters: sql<
        number | null
      >`max(${sharedExerciseStats.longestDistanceMeters})::float8`,
    })
    .from(sharedExerciseStats)
    .where(
      and(
        eq(sharedExerciseStats.userId, userId),
        inArray(sharedExerciseStats.exerciseId, [...exerciseIds]),
        lt(sharedExerciseStats.startedAt, startedAt),
      ),
    )
    .groupBy(sharedExerciseStats.exerciseId);
  for (const row of rows) {
    const best: Partial<Record<SharedMetric, number>> = {};
    for (const metric of SHARED_METRICS) {
      const value = metricValue(row, metric);
      if (value !== null) best[metric] = value;
    }
    maxima.set(row.exerciseId, best);
  }
  return maxima;
}

/**
 * Writes a finished workout's shared rows and returns the records it set. Upserts on the
 * unique keys, so the backfill can run over history that already has rows; an exercise row
 * the recomputation no longer produces is removed.
 */
export async function writeSessionStats(
  tx: DbOrTx,
  userId: string,
  workout: StatsWorkout,
  timeZone?: string,
): Promise<TrainingRecord[]> {
  const zone = timeZone ?? (await ownerTimeZone(tx, userId));
  const stats = sessionStats(workout, zone);
  const previous = await previousMaxima(
    tx,
    userId,
    stats.exercises.map((e) => e.exerciseId),
    workout.startedAt,
  );
  const records = detectRecords(previous, stats.exercises);
  const { session } = stats;
  await tx
    .insert(sharedSessionStats)
    .values({
      userId,
      sport: session.sport,
      sourceId: session.sourceId,
      title: session.title,
      occurredOn: session.occurredOn,
      startedAt: session.startedAt,
      durationSeconds: session.durationSeconds,
      workingSets: session.workingSets,
      volumeKg: session.volumeKg,
      distanceMeters: null,
      paceSecondsPerKm: null,
      muscleSets: session.muscleSets,
      records,
    })
    .onConflictDoUpdate({
      target: [sharedSessionStats.userId, sharedSessionStats.sport, sharedSessionStats.sourceId],
      set: {
        title: session.title,
        occurredOn: session.occurredOn,
        startedAt: session.startedAt,
        durationSeconds: session.durationSeconds,
        workingSets: session.workingSets,
        volumeKg: session.volumeKg,
        muscleSets: session.muscleSets,
        records,
        updatedAt: new Date(),
      },
    });
  const keep = stats.exercises.map((e) => e.exerciseId);
  await tx
    .delete(sharedExerciseStats)
    .where(
      and(
        eq(sharedExerciseStats.userId, userId),
        eq(sharedExerciseStats.workoutSessionId, workout.id),
        keep.length ? notInArray(sharedExerciseStats.exerciseId, keep) : undefined,
      ),
    );
  if (stats.exercises.length > 0) {
    await tx
      .insert(sharedExerciseStats)
      .values(
        stats.exercises.map((e) => ({
          userId,
          workoutSessionId: workout.id,
          exerciseId: e.exerciseId,
          occurredOn: session.occurredOn,
          startedAt: session.startedAt,
          comparable: e.comparable,
          workingSets: e.workingSets,
          totalReps: e.totalReps,
          topWeightKg: e.topWeightKg,
          topWeightSets: e.topWeightSets,
          topWeightReps: e.topWeightReps,
          bestE1rmKg: e.bestE1rmKg,
          bestSetVolumeKg: e.bestSetVolumeKg,
          mostReps: e.mostReps,
          longestDurationSeconds: e.longestDurationSeconds,
          longestDistanceMeters: e.longestDistanceMeters,
        })),
      )
      .onConflictDoUpdate({
        target: [
          sharedExerciseStats.userId,
          sharedExerciseStats.workoutSessionId,
          sharedExerciseStats.exerciseId,
        ],
        set: {
          occurredOn: sql`excluded.occurred_on`,
          startedAt: sql`excluded.started_at`,
          comparable: sql`excluded.comparable`,
          workingSets: sql`excluded.working_sets`,
          totalReps: sql`excluded.total_reps`,
          topWeightKg: sql`excluded.top_weight_kg`,
          topWeightSets: sql`excluded.top_weight_sets`,
          topWeightReps: sql`excluded.top_weight_reps`,
          bestE1rmKg: sql`excluded.best_e1rm_kg`,
          bestSetVolumeKg: sql`excluded.best_set_volume_kg`,
          mostReps: sql`excluded.most_reps`,
          longestDurationSeconds: sql`excluded.longest_duration_seconds`,
          longestDistanceMeters: sql`excluded.longest_distance_meters`,
        },
      });
  }
  return records;
}

/** Writes or rewrites a run's shared row. */
export async function writeRunStats(
  tx: DbOrTx,
  userId: string,
  run: StatsRun,
  timeZone?: string,
): Promise<void> {
  const zone = timeZone ?? (await ownerTimeZone(tx, userId));
  const stats = runStats(run, zone);
  await tx
    .insert(sharedSessionStats)
    .values({
      userId,
      sport: stats.sport,
      sourceId: stats.sourceId,
      title: stats.title,
      occurredOn: stats.occurredOn,
      startedAt: stats.startedAt,
      durationSeconds: stats.durationSeconds,
      workingSets: 0,
      volumeKg: 0,
      distanceMeters: stats.distanceMeters,
      paceSecondsPerKm: stats.paceSecondsPerKm,
      muscleSets: {},
      records: [],
    })
    .onConflictDoUpdate({
      target: [sharedSessionStats.userId, sharedSessionStats.sport, sharedSessionStats.sourceId],
      set: {
        occurredOn: stats.occurredOn,
        startedAt: stats.startedAt,
        durationSeconds: stats.durationSeconds,
        distanceMeters: stats.distanceMeters,
        paceSecondsPerKm: stats.paceSecondsPerKm,
        updatedAt: new Date(),
      },
    });
}

/**
 * A ride's or a swim's shared row, written only where the athlete has opted in (SOCIAL-02).
 *
 * Two gates, both of which must be open: the global `share_training` switch, which is the
 * upper bound on everything, and this sport's own preference, which starts off. Neither is
 * inferred from the other, and no migration opens one — an account that never answered
 * shares nothing new.
 */
export async function writeEnduranceStats(
  tx: DbOrTx,
  userId: string,
  sport: "cycle" | "swim",
  session: StatsEnduranceSession,
  timeZone?: string,
): Promise<void> {
  const canonical = sport === "cycle" ? "cycling" : "swimming";
  const [profile] = await tx
    .select({ shareTraining: profiles.shareTraining, timeZone: profiles.timeZone })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (!profile?.shareTraining) return;
  const [preference] = await tx
    .select({ shareStats: userSportPreferences.shareStats })
    .from(userSportPreferences)
    .where(and(eq(userSportPreferences.userId, userId), eq(userSportPreferences.sport, canonical)))
    .limit(1);
  if (!preference?.shareStats) return;
  const stats = enduranceStats(sport, session, timeZone ?? profile.timeZone);
  await tx
    .insert(sharedSessionStats)
    .values({
      userId,
      sport: stats.sport,
      sourceId: stats.sourceId,
      activityId: session.id,
      title: stats.title,
      occurredOn: stats.occurredOn,
      startedAt: stats.startedAt,
      durationSeconds: stats.durationSeconds,
      workingSets: 0,
      volumeKg: 0,
      distanceMeters: stats.distanceMeters,
      paceSecondsPerKm: null,
      muscleSets: {},
      records: [],
    })
    .onConflictDoUpdate({
      target: [sharedSessionStats.userId, sharedSessionStats.sport, sharedSessionStats.sourceId],
      set: {
        occurredOn: stats.occurredOn,
        startedAt: stats.startedAt,
        durationSeconds: stats.durationSeconds,
        distanceMeters: stats.distanceMeters,
        updatedAt: new Date(),
      },
    });
}

/**
 * Removes every shared projection of one activity, whatever sport it is.
 *
 * Called when the activity is deleted and when sharing is turned off. Turning a switch off
 * has to take the rows with it immediately: a projection that outlives the consent that
 * created it is the whole of what AT-PRIV-05 is about.
 */
export async function deleteActivityStats(
  tx: DbOrTx,
  userId: string,
  activityId: string,
): Promise<void> {
  await tx
    .delete(sharedSessionStats)
    .where(and(eq(sharedSessionStats.userId, userId), eq(sharedSessionStats.sourceId, activityId)));
}

/**
 * Rebuilds one sport's shared rows from the activities that are still there.
 *
 * Only currently consented fields: the projection is derived afresh rather than restored from
 * anything kept aside, so re-enabling sharing cannot bring back a field the athlete has since
 * stopped sharing, or an activity they have since deleted (§9.2).
 */
export async function rebuildSportStats(
  tx: DbOrTx,
  userId: string,
  sport: ActivitySport,
): Promise<void> {
  if (sport !== "cycling" && sport !== "swimming") return;
  const legacy = sport === "cycling" ? "cycle" : "swim";
  await deleteSportStats(tx, userId, legacy);
  const details = sport === "cycling" ? cyclingActivityDetails : swimmingActivityDetails;
  const rows = await tx
    .select({
      id: activities.id,
      startedAt: activities.startedAt,
      durationMs: activities.durationMs,
      distanceMetres: sql<string | null>`coalesce(
        ${details.distanceMetres},
        ${sport === "swimming" ? sql`${swimmingActivityDetails.lengths} * ${swimmingActivityDetails.poolLengthMetres}` : sql`null`}
      )::numeric`,
    })
    .from(activities)
    .innerJoin(details, eq(details.activityId, activities.id))
    .where(
      and(
        eq(activities.userId, userId),
        eq(activities.sport, sport),
        eq(activities.status, "completed"),
      ),
    );
  for (const row of rows) {
    if (row.durationMs === null) continue;
    await writeEnduranceStats(tx, userId, legacy, {
      id: row.id,
      startedAt: row.startedAt,
      durationSeconds: Math.round(row.durationMs / 1000),
      distanceMeters: row.distanceMetres === null ? null : Number(row.distanceMetres),
    });
  }
}

/** Every shared row of one sport, for a switch turned off (AT-PRIV-05). */
export async function deleteSportStats(
  tx: DbOrTx,
  userId: string,
  sport: TrainingSport,
): Promise<void> {
  await tx
    .delete(sharedSessionStats)
    .where(and(eq(sharedSessionStats.userId, userId), eq(sharedSessionStats.sport, sport)));
}

export async function deleteRunStats(tx: DbOrTx, userId: string, runId: string): Promise<void> {
  await tx
    .delete(sharedSessionStats)
    .where(
      and(
        eq(sharedSessionStats.userId, userId),
        eq(sharedSessionStats.sport, "run"),
        eq(sharedSessionStats.sourceId, runId),
      ),
    );
}

/** The latest reading, as the one row a follower who also shares may see. */
export async function writeBodyWeight(
  tx: DbOrTx,
  userId: string,
  reading: BodyWeightReading,
): Promise<void> {
  await tx
    .insert(sharedBodyWeight)
    .values({ userId, weightKg: reading.weightKg, measuredOn: reading.measuredOn })
    .onConflictDoUpdate({
      target: sharedBodyWeight.userId,
      set: { weightKg: reading.weightKg, measuredOn: reading.measuredOn, updatedAt: new Date() },
    });
}

/** Whether the signed-in user may see `ownerId`'s training, as the policies decide it. */
export async function canViewTraining(tx: DbOrTx, ownerId: string): Promise<boolean> {
  const [row] = await tx
    .select({ ok: sql<boolean>`public.can_view_training(${ownerId})` })
    .from(profileDirectory)
    .limit(1);
  return row?.ok === true;
}

const EXERCISE_COLUMNS = {
  id: exercises.id,
  name: exercises.name,
  modality: exercises.modality,
  defaultPrescriptionType: exercises.defaultPrescriptionType,
};

export type RecordWithExercise = TrainingRecord & {
  exercise: MetricExercise & { id: string; name: string };
};

/** The records a finished workout set, with the movements they belong to, for its page. */
export async function readSessionRecords(
  tx: DbOrTx,
  userId: string,
  sessionId: string,
): Promise<RecordWithExercise[]> {
  const [row] = await tx
    .select({ records: sharedSessionStats.records })
    .from(sharedSessionStats)
    .where(
      and(
        eq(sharedSessionStats.userId, userId),
        eq(sharedSessionStats.sport, "workout"),
        eq(sharedSessionStats.sourceId, sessionId),
      ),
    )
    .limit(1);
  if (!row || row.records.length === 0) return [];
  const ids = [...new Set(row.records.map((r) => r.exerciseId))];
  const named = await tx.select(EXERCISE_COLUMNS).from(exercises).where(inArray(exercises.id, ids));
  const byId = new Map(named.map((e) => [e.id, e]));
  return row.records.flatMap((record) => {
    const exercise = byId.get(record.exerciseId);
    return exercise ? [{ ...record, exercise }] : [];
  });
}

export type PeriodTotals = {
  sessions: number;
  workingSets: number;
  volumeKg: number;
  durationSeconds: number;
  /** Distinct days with a session. */
  activeDays: number;
  /** Records set across the period's sessions. */
  records: number;
  /** Runs (§3.16): total distance, the fastest pace over a run of 1 km or more, longest run. */
  distanceMeters: number;
  bestPaceSecondsPerKm: number | null;
  longestRunMeters: number;
};

/** A period with nothing in it: what a person with no session reads as. */
export const EMPTY_TOTALS: PeriodTotals = {
  sessions: 0,
  workingSets: 0,
  volumeKg: 0,
  durationSeconds: 0,
  activeDays: 0,
  records: 0,
  distanceMeters: 0,
  bestPaceSecondsPerKm: null,
  longestRunMeters: 0,
};

/** A run shorter than this cannot set a best pace: a sprint to the corner is not a pace. */
export const BEST_PACE_MIN_METERS = 1000;

/**
 * A period's headline numbers for each of several people; absent when they logged nothing.
 * One shape for both sports: a workout's run columns read zero and a run's lifting columns
 * do, so the sport asked for decides which are shown.
 */
export async function readPeriodTotals(
  tx: DbOrTx,
  userIds: readonly string[],
  sport: TrainingSport,
  range: DateRange,
): Promise<Map<string, PeriodTotals>> {
  if (userIds.length === 0) return new Map();
  const rows = await tx
    .select({
      userId: sharedSessionStats.userId,
      sessions: sql<number>`count(*)::int`,
      workingSets: sql<number>`coalesce(sum(${sharedSessionStats.workingSets}), 0)::int`,
      volumeKg: sql<number>`coalesce(sum(${sharedSessionStats.volumeKg}), 0)::float8`,
      durationSeconds: sql<number>`coalesce(sum(${sharedSessionStats.durationSeconds}), 0)::int`,
      activeDays: sql<number>`count(distinct ${sharedSessionStats.occurredOn})::int`,
      records: sql<number>`coalesce(sum(jsonb_array_length(${sharedSessionStats.records})), 0)::int`,
      distanceMeters: sql<number>`coalesce(sum(${sharedSessionStats.distanceMeters}), 0)::float8`,
      bestPaceSecondsPerKm: sql<
        number | null
      >`(min(${sharedSessionStats.paceSecondsPerKm}) filter (where ${sharedSessionStats.distanceMeters} >= ${BEST_PACE_MIN_METERS}))::float8`,
      longestRunMeters: sql<number>`coalesce(max(${sharedSessionStats.distanceMeters}), 0)::float8`,
    })
    .from(sharedSessionStats)
    .where(
      and(
        inArray(sharedSessionStats.userId, [...userIds]),
        eq(sharedSessionStats.sport, sport),
        gte(sharedSessionStats.occurredOn, range.from),
        lte(sharedSessionStats.occurredOn, range.to),
      ),
    )
    .groupBy(sharedSessionStats.userId);
  return new Map(rows.map(({ userId, ...totals }) => [userId, totals]));
}

/**
 * Activity mode of the leaderboard (plan §3.12): one number per person in the circle for the
 * period, read off the same totals Compare shows. A person with no session in the period is
 * absent, which the board lists as "—", as is one whose sessions cannot give the metric (no
 * run of a kilometre for a best pace); one who trained but scored nothing on the metric is
 * present at 0, since that is a fact about their training and not a gap in it.
 */
export async function readLeaderboard(
  tx: DbOrTx,
  userIds: readonly string[],
  sport: TrainingSport,
  metric: ActivityMetric,
  range: DateRange,
): Promise<Map<string, number>> {
  const totals = await readPeriodTotals(tx, userIds, sport, range);
  const values = new Map<string, number>();
  for (const [userId, t] of totals) {
    const value = activityValue(t, metric);
    if (value !== null) values.set(userId, value);
  }
  return values;
}

/** One person's working sets per muscle over a period, for the split radar. */
export async function readMuscleSets(
  tx: DbOrTx,
  userId: string,
  range: DateRange,
): Promise<MuscleSets> {
  const rows = await tx
    .select({ muscleSets: sharedSessionStats.muscleSets })
    .from(sharedSessionStats)
    .where(
      and(
        eq(sharedSessionStats.userId, userId),
        eq(sharedSessionStats.sport, "workout"),
        gte(sharedSessionStats.occurredOn, range.from),
        lte(sharedSessionStats.occurredOn, range.to),
      ),
    );
  return rows.reduce<MuscleSets>((into, row) => addMuscleSets(into, row.muscleSets), {});
}

export type ExerciseBest = {
  metric: SharedMetric;
  value: number;
  occurredOn: string;
  /**
   * For top weight only: the working sets at that load in the session credited with it and
   * the most reps one of them reached — "4 × 12". Null on the other metrics, and on a best
   * from rows written before the columns existed.
   */
  work: { sets: number; reps: number | null } | null;
};

/**
 * The best value of each metric each person has for one movement, and when it was set: the
 * "Your records" tiles, and both sides of an exercise comparison. Read in full and reduced
 * here; a person's rows for one exercise are a few hundred at most. A person with no rows
 * (or none the viewer may see) is absent from the map. Ties keep the earliest day, except
 * that a top weight is credited to the session that worked it hardest — more reps, then more
 * sets — since "7.5 kg · 4 × 12" says more than the day 7.5 kg was first lifted once.
 */
export async function readExerciseBests(
  tx: DbOrTx,
  userIds: readonly string[],
  exerciseId: string,
): Promise<Map<string, ExerciseBest[]>> {
  if (userIds.length === 0) return new Map();
  const rows = await tx
    .select({
      userId: sharedExerciseStats.userId,
      occurredOn: sharedExerciseStats.occurredOn,
      bestE1rmKg: sharedExerciseStats.bestE1rmKg,
      topWeightKg: sharedExerciseStats.topWeightKg,
      topWeightSets: sharedExerciseStats.topWeightSets,
      topWeightReps: sharedExerciseStats.topWeightReps,
      bestSetVolumeKg: sharedExerciseStats.bestSetVolumeKg,
      mostReps: sharedExerciseStats.mostReps,
      longestDurationSeconds: sharedExerciseStats.longestDurationSeconds,
      longestDistanceMeters: sharedExerciseStats.longestDistanceMeters,
    })
    .from(sharedExerciseStats)
    .where(
      and(
        inArray(sharedExerciseStats.userId, [...userIds]),
        eq(sharedExerciseStats.exerciseId, exerciseId),
      ),
    )
    // Oldest first, so a tie keeps the day it was first reached.
    .orderBy(asc(sharedExerciseStats.startedAt));
  const result = new Map<string, ExerciseBest[]>();
  for (const userId of new Set(rows.map((row) => row.userId))) {
    const own = rows.filter((row) => row.userId === userId);
    const bests: ExerciseBest[] = [];
    for (const metric of SHARED_METRICS) {
      let best: ExerciseBest | null = null;
      for (const row of own) {
        const value = metricValue(row, metric);
        if (value === null) continue;
        const work =
          metric === "top_weight" && row.topWeightSets !== null
            ? { sets: row.topWeightSets, reps: row.topWeightReps }
            : null;
        const better =
          best === null || value > best.value || (value === best.value && harder(work, best.work));
        if (better) best = { metric, value, occurredOn: row.occurredOn, work };
      }
      if (best) bests.push(best);
    }
    result.set(userId, bests);
  }
  return result;
}

/** Whether one session's work at a load outdoes another's: more reps, then more sets. */
function harder(a: ExerciseBest["work"], b: ExerciseBest["work"]): boolean {
  if (!a) return false;
  if (!b) return true;
  const reps = (work: NonNullable<ExerciseBest["work"]>) => work.reps ?? 0;
  return reps(a) > reps(b) || (reps(a) === reps(b) && a.sets > b.sets);
}

export type TrendPoint = { date: string; value: number };

/**
 * One metric of one movement per session for each person over a period, oldest first: the
 * two lines of an exercise comparison. Two sessions on one day keep the better one.
 */
export async function readExerciseTrend(
  tx: DbOrTx,
  userIds: readonly string[],
  exerciseId: string,
  metric: SharedMetric,
  range: DateRange,
): Promise<Map<string, TrendPoint[]>> {
  if (userIds.length === 0) return new Map();
  const rows = await tx
    .select({
      userId: sharedExerciseStats.userId,
      occurredOn: sharedExerciseStats.occurredOn,
      bestE1rmKg: sharedExerciseStats.bestE1rmKg,
      topWeightKg: sharedExerciseStats.topWeightKg,
      bestSetVolumeKg: sharedExerciseStats.bestSetVolumeKg,
      mostReps: sharedExerciseStats.mostReps,
      longestDurationSeconds: sharedExerciseStats.longestDurationSeconds,
      longestDistanceMeters: sharedExerciseStats.longestDistanceMeters,
    })
    .from(sharedExerciseStats)
    .where(
      and(
        inArray(sharedExerciseStats.userId, [...userIds]),
        eq(sharedExerciseStats.exerciseId, exerciseId),
        gte(sharedExerciseStats.occurredOn, range.from),
        lte(sharedExerciseStats.occurredOn, range.to),
      ),
    )
    .orderBy(asc(sharedExerciseStats.startedAt));
  const result = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const value = metricValue(row, metric);
    if (value === null) continue;
    const days = result.get(row.userId) ?? new Map<string, number>();
    days.set(row.occurredOn, Math.max(days.get(row.occurredOn) ?? -Infinity, value));
    result.set(row.userId, days);
  }
  return new Map(
    [...result].map(([userId, days]) => [
      userId,
      [...days].map(([date, value]) => ({ date, value })),
    ]),
  );
}

export type CommonExercise = {
  id: string;
  name: string;
  region: BodyRegion;
};

/**
 * The comparable movements both people logged in the period, by name, and how many machine
 * or context-bound movements they also share, which are counted but never compared (§3.9).
 */
export async function readExercisesInCommon(
  tx: DbOrTx,
  a: string,
  b: string,
  range: DateRange,
): Promise<{ comparable: CommonExercise[]; notComparable: number }> {
  const rows = await tx
    .selectDistinct({
      userId: sharedExerciseStats.userId,
      id: exercises.id,
      name: exercises.name,
      primaryMuscles: exercises.primaryMuscles,
      comparable: sharedExerciseStats.comparable,
    })
    .from(sharedExerciseStats)
    .innerJoin(exercises, eq(exercises.id, sharedExerciseStats.exerciseId))
    .where(
      and(
        inArray(sharedExerciseStats.userId, [a, b]),
        gte(sharedExerciseStats.occurredOn, range.from),
        lte(sharedExerciseStats.occurredOn, range.to),
      ),
    );
  const ofA = new Set(rows.filter((row) => row.userId === a).map((row) => row.id));
  const both = rows.filter((row) => row.userId === b && ofA.has(row.id));
  return {
    comparable: both
      .filter((row) => row.comparable)
      .map((row) => ({ id: row.id, name: row.name, region: regionOf(row.primaryMuscles) }))
      .sort((x, y) => x.name.localeCompare(y.name)),
    notComparable: both.filter((row) => !row.comparable).length,
  };
}

export type SharedReading = { weightKg: number; measuredOn: string };

/** The latest body weight of each person the viewer may see it for (both opted in). */
export async function readBodyWeights(
  tx: DbOrTx,
  userIds: readonly string[],
): Promise<Map<string, SharedReading>> {
  if (userIds.length === 0) return new Map();
  const rows = await tx
    .select({
      userId: sharedBodyWeight.userId,
      weightKg: sharedBodyWeight.weightKg,
      measuredOn: sharedBodyWeight.measuredOn,
    })
    .from(sharedBodyWeight)
    .where(inArray(sharedBodyWeight.userId, [...userIds]));
  return new Map(rows.map(({ userId, ...reading }) => [userId, reading]));
}

export type SharedActivityDetail = {
  id: string;
  sport: TrainingSport;
  title: string;
  occurredOn: string;
  durationSeconds: number;
  workingSets: number;
  volumeKg: number;
  distanceMeters: number | null;
  paceSecondsPerKm: number | null;
};

/**
 * One shared row, read by its own shared id and by nothing else (SOCIAL-02, AT-PRIV-04).
 *
 * The parameter is the `shared_session_stats` id, not the activity's. That is the whole
 * privacy argument: a raw activity id names a private record, and guessing one must reveal
 * neither its contents nor the fact that it exists. RLS answers the rest — a row the reader
 * is not allowed to see simply is not there, so a wrong id and a forbidden id look identical.
 */
export async function readSharedActivity(
  tx: DbOrTx,
  ownerId: string,
  sharedStatId: string,
): Promise<SharedActivityDetail | null> {
  const [row] = await tx
    .select({
      id: sharedSessionStats.id,
      sport: sharedSessionStats.sport,
      title: sharedSessionStats.title,
      occurredOn: sharedSessionStats.occurredOn,
      durationSeconds: sharedSessionStats.durationSeconds,
      workingSets: sharedSessionStats.workingSets,
      volumeKg: sharedSessionStats.volumeKg,
      distanceMeters: sharedSessionStats.distanceMeters,
      paceSecondsPerKm: sharedSessionStats.paceSecondsPerKm,
    })
    .from(sharedSessionStats)
    .where(and(eq(sharedSessionStats.id, sharedStatId), eq(sharedSessionStats.userId, ownerId)))
    .limit(1);
  return row ?? null;
}

export type ComparableExerciseRow = MetricExercise & {
  id: string;
  name: string;
  region: BodyRegion;
};

/** A shared-library movement that can be compared across people, or null (§3.9). */
export async function getComparableExercise(
  tx: DbOrTx,
  exerciseId: string,
): Promise<ComparableExerciseRow | null> {
  const [row] = await tx
    .select({ ...EXERCISE_COLUMNS, primaryMuscles: exercises.primaryMuscles })
    .from(exercises)
    .where(
      and(
        eq(exercises.id, exerciseId),
        isNull(exercises.userId),
        eq(exercises.loadPortability, "global"),
      ),
    )
    .limit(1);
  if (!row) return null;
  const { primaryMuscles, ...exercise } = row;
  return { ...exercise, region: regionOf(primaryMuscles) };
}

export type CircleExercise = ComparableExerciseRow & {
  /** How many people in the circle have logged it, ever. */
  people: number;
};

/**
 * Exercise mode's picker (plan §3.12): the comparable movements anyone in the circle has
 * ever logged, the ones most of them share first, then by name.
 */
export async function readCircleExercises(
  tx: DbOrTx,
  userIds: readonly string[],
): Promise<CircleExercise[]> {
  if (userIds.length === 0) return [];
  const rows = await tx
    .select({
      ...EXERCISE_COLUMNS,
      primaryMuscles: exercises.primaryMuscles,
      people: sql<number>`count(distinct ${sharedExerciseStats.userId})::int`,
    })
    .from(sharedExerciseStats)
    .innerJoin(exercises, eq(exercises.id, sharedExerciseStats.exerciseId))
    .where(
      and(
        inArray(sharedExerciseStats.userId, [...userIds]),
        eq(sharedExerciseStats.comparable, true),
      ),
    )
    .groupBy(exercises.id)
    .orderBy(desc(sql`count(distinct ${sharedExerciseStats.userId})`), asc(exercises.name));
  return rows.map(({ primaryMuscles, ...exercise }) => ({
    ...exercise,
    region: regionOf(primaryMuscles),
  }));
}

export type PeriodRecord = {
  exercise: MetricExercise & { id: string; name: string };
  metric: SharedMetric;
  value: number;
  occurredOn: string;
};

/** How many lifts, and how many other movements, a profile's Records lists (plan §3.13). */
export const PROFILE_RECORDS_LIMIT = 5;

/**
 * A person's best per comparable movement in the period (plan §3.13): the five best lifts by
 * estimated 1RM, then up to five other movements by their own primary metric.
 */
export async function readRecords(
  tx: DbOrTx,
  userId: string,
  range: DateRange,
): Promise<PeriodRecord[]> {
  const rows = await tx
    .select({
      exercise: EXERCISE_COLUMNS,
      occurredOn: sharedExerciseStats.occurredOn,
      bestE1rmKg: sharedExerciseStats.bestE1rmKg,
      topWeightKg: sharedExerciseStats.topWeightKg,
      bestSetVolumeKg: sharedExerciseStats.bestSetVolumeKg,
      mostReps: sharedExerciseStats.mostReps,
      longestDurationSeconds: sharedExerciseStats.longestDurationSeconds,
      longestDistanceMeters: sharedExerciseStats.longestDistanceMeters,
    })
    .from(sharedExerciseStats)
    .innerJoin(exercises, eq(exercises.id, sharedExerciseStats.exerciseId))
    .where(
      and(
        eq(sharedExerciseStats.userId, userId),
        eq(sharedExerciseStats.comparable, true),
        gte(sharedExerciseStats.occurredOn, range.from),
        lte(sharedExerciseStats.occurredOn, range.to),
      ),
    )
    .orderBy(asc(sharedExerciseStats.startedAt));
  const best = new Map<string, PeriodRecord>();
  for (const row of rows) {
    const metric = primaryMetric(row.exercise);
    const value = metricValue(row, metric);
    if (value === null) continue;
    const current = best.get(row.exercise.id);
    if (!current || value > current.value) {
      best.set(row.exercise.id, {
        exercise: row.exercise,
        metric,
        value,
        occurredOn: row.occurredOn,
      });
    }
  }
  const all = [...best.values()];
  const byValue = (a: PeriodRecord, b: PeriodRecord) =>
    b.value - a.value || a.exercise.name.localeCompare(b.exercise.name);
  const lifts = all.filter((r) => r.metric === "e1rm").sort(byValue);
  const others = all
    .filter((r) => r.metric !== "e1rm")
    .sort((a, b) => a.metric.localeCompare(b.metric) || byValue(a, b));
  return [...lifts.slice(0, PROFILE_RECORDS_LIMIT), ...others.slice(0, PROFILE_RECORDS_LIMIT)];
}

export type ActivityRow = {
  id: string;
  person: { id: string; username: string; displayName: string | null };
  sport: TrainingSport;
  title: string;
  occurredOn: string;
  startedAt: Date;
  durationSeconds: number;
  workingSets: number;
  volumeKg: number;
  distanceMeters: number | null;
  paceSecondsPerKm: number | null;
  records: number;
};

/** The last shared sessions of the given people, newest first: the quiet list (plan §3.4). */
export async function readActivity(
  tx: DbOrTx,
  userIds: readonly string[],
  limit = 20,
): Promise<ActivityRow[]> {
  if (userIds.length === 0) return [];
  const rows = await tx
    .select({
      id: sharedSessionStats.id,
      person: {
        id: profileDirectory.id,
        username: profileDirectory.username,
        displayName: profileDirectory.displayName,
      },
      sport: sharedSessionStats.sport,
      title: sharedSessionStats.title,
      occurredOn: sharedSessionStats.occurredOn,
      startedAt: sharedSessionStats.startedAt,
      durationSeconds: sharedSessionStats.durationSeconds,
      workingSets: sharedSessionStats.workingSets,
      volumeKg: sharedSessionStats.volumeKg,
      distanceMeters: sharedSessionStats.distanceMeters,
      paceSecondsPerKm: sharedSessionStats.paceSecondsPerKm,
      records: sql<number>`jsonb_array_length(${sharedSessionStats.records})::int`,
    })
    .from(sharedSessionStats)
    .innerJoin(profileDirectory, eq(profileDirectory.id, sharedSessionStats.userId))
    .where(inArray(sharedSessionStats.userId, [...userIds]))
    .orderBy(desc(sharedSessionStats.startedAt), desc(sharedSessionStats.id))
    .limit(limit);
  return rows;
}
