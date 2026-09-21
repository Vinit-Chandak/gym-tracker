import { and, asc, desc, eq, exists, gte, inArray, isNotNull, lt, lte, sql } from "drizzle-orm";

import {
  activities,
  dailyRecovery,
  equipmentInstances,
  exercises,
  gyms,
  programDays,
  runningActivityDetails,
  runs,
  setLogs,
  workoutExercises,
  workoutSessions,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { effortFromStorage, type Effort, type RunningEnvironment } from "@/domain/activity";
import { paceSecondsPerKm } from "@/domain/pace";
import type { DateRange } from "@/server/validation/date-range";

export const TRAINING_RECORD_LIMIT = 500;
const inRange = (range: DateRange | null) =>
  range
    ? and(gte(workoutSessions.startedAt, range.start), lt(workoutSessions.startedAt, range.end))
    : undefined;

/** Bounded, batched raw data shared by history, analytics and the read-only coach API. Caller enforces RLS. */
export async function readWorkouts(
  db: DbOrTx,
  userId: string,
  /** Null reads across all time; pair it with `sessionId` or accept the record limit. */
  range: DateRange | null,
  page = 0,
  limit = TRAINING_RECORD_LIMIT,
  filter: {
    /** One session, whole: what finishing it computes its shared stats from. */
    sessionId?: string;
    exerciseId?: string;
    equipmentInstanceId?: string;
    completedOnly?: boolean;
    /** Require completion by this instant as well as starting within the range. */
    completedBy?: Date;
  } = {},
) {
  const matchingExercise = filter.exerciseId
    ? exists(
        db
          .select({ one: sql`1` })
          .from(workoutExercises)
          .where(
            and(
              eq(workoutExercises.workoutSessionId, workoutSessions.id),
              eq(workoutExercises.exerciseId, filter.exerciseId),
              filter.equipmentInstanceId
                ? eq(workoutExercises.equipmentInstanceId, filter.equipmentInstanceId)
                : undefined,
            ),
          ),
      )
    : undefined;
  const records = await db
    .select({
      session: workoutSessions,
      gym: { id: gyms.id, name: gyms.name },
      day: { id: programDays.id, name: programDays.name },
    })
    .from(workoutSessions)
    .innerJoin(gyms, eq(gyms.id, workoutSessions.gymId))
    .leftJoin(programDays, eq(programDays.id, workoutSessions.programDayId))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        inRange(range),
        filter.sessionId ? eq(workoutSessions.id, filter.sessionId) : undefined,
        matchingExercise,
        filter.completedOnly ? isNotNull(workoutSessions.completedAt) : undefined,
        filter.completedBy ? lte(workoutSessions.completedAt, filter.completedBy) : undefined,
      ),
    )
    .orderBy(desc(workoutSessions.startedAt), desc(workoutSessions.id))
    .limit(limit + 1)
    .offset(page * limit);
  const hasMore = records.length > limit;
  const selected = records.slice(0, limit);
  const sessionIds = selected.map((r) => r.session.id);
  // Slots and sets both hang off the chosen sessions, so they are read side by side rather
  // than sets waiting for the slot ids to come back.
  const [slots, sets] = selected.length
    ? await Promise.all([
        db
          .select({
            slot: workoutExercises,
            exercise: {
              id: exercises.id,
              /** Null for the shared library; the shared stats need to know (plan §3.9). */
              userId: exercises.userId,
              name: exercises.name,
              slug: exercises.slug,
              modality: exercises.modality,
              loadPortability: exercises.loadPortability,
              defaultPrescriptionType: exercises.defaultPrescriptionType,
              primaryMuscles: exercises.primaryMuscles,
              secondaryMuscles: exercises.secondaryMuscles,
            },
            equipment: {
              id: equipmentInstances.id,
              name: equipmentInstances.name,
              gymId: equipmentInstances.gymId,
            },
          })
          .from(workoutExercises)
          .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
          .leftJoin(
            equipmentInstances,
            eq(equipmentInstances.id, workoutExercises.equipmentInstanceId),
          )
          .where(
            and(
              eq(workoutExercises.userId, userId),
              inArray(workoutExercises.workoutSessionId, sessionIds),
            ),
          )
          .orderBy(asc(workoutExercises.orderIndex)),
        db
          .select({ set: setLogs })
          .from(setLogs)
          .innerJoin(workoutExercises, eq(workoutExercises.id, setLogs.workoutExerciseId))
          .where(
            and(eq(setLogs.userId, userId), inArray(workoutExercises.workoutSessionId, sessionIds)),
          )
          .orderBy(asc(setLogs.setIndex))
          .then((rows) => rows.map((row) => row.set)),
      ])
    : [[], []];
  const setsBySlot = new Map<string, typeof sets>();
  for (const set of sets) {
    const group = setsBySlot.get(set.workoutExerciseId) ?? [];
    group.push(set);
    setsBySlot.set(set.workoutExerciseId, group);
  }
  // Grouped rather than filtered per session: at the 500-record limit a scan per
  // session is millions of comparisons, and the slots already arrive in order.
  const slotsBySession = new Map<string, ReturnType<typeof enrich>[]>();
  function enrich(row: (typeof slots)[number]) {
    return {
      ...row.slot,
      exercise: row.exercise,
      equipment: row.equipment,
      sets: setsBySlot.get(row.slot.id) ?? [],
    };
  }
  for (const row of slots) {
    const group = slotsBySession.get(row.slot.workoutSessionId) ?? [];
    group.push(enrich(row));
    slotsBySession.set(row.slot.workoutSessionId, group);
  }
  return {
    hasMore,
    workouts: selected.map((row) => ({
      ...row.session,
      gym: row.gym,
      day: row.day,
      exercises: slotsBySession.get(row.session.id) ?? [],
    })),
  };
}

/**
 * The raw `runs` table, which nothing has written to since the multisport cutover.
 *
 * Kept for the two readers that mean the old rows specifically: version 1 of the coach API,
 * whose compatibility window promises those exact records, and the shared-stats backfill,
 * which is keyed by their identifiers. Everything an athlete sees reads
 * `readRunActivities` below instead.
 */
export async function readRuns(
  db: DbOrTx,
  userId: string,
  range: DateRange,
  page = 0,
  limit = TRAINING_RECORD_LIMIT,
) {
  const records = await db
    .select()
    .from(runs)
    .where(
      and(eq(runs.userId, userId), gte(runs.startedAt, range.start), lt(runs.startedAt, range.end)),
    )
    .orderBy(desc(runs.startedAt), desc(runs.id))
    .limit(limit + 1)
    .offset(page * limit);
  return { hasMore: records.length > limit, runs: records.slice(0, limit) };
}

/** A run as every screen an athlete looks at reads one. */
export type RunActivity = {
  id: string;
  startedAt: Date;
  /** The local date it happened on, frozen when it was saved (plan §6.3). */
  occurredOn: string;
  /** Outdoor or treadmill: what the old `mode` is called on the canonical row. */
  environment: RunningEnvironment;
  durationSeconds: number;
  distanceMeters: number;
  averagePaceSecondsPerKm: number | null;
  /** The number and how far it can be trusted; a migrated one stays unconfirmed (LOG-03). */
  effort: Effort;
  surface: string | null;
  title: string | null;
  notes: string | null;
  /** Where a migrated run said it started from. A run logged since records no gym. */
  gymId: string | null;
};

/**
 * Runs, from the canonical activity that holds every sport (plan §6.3).
 *
 * Nothing has written to `runs` since the cutover — the logger writes an activity and its
 * running detail, as it does for a ride or a swim — so a screen still reading the old table
 * shows an account its migrated history and nothing at all that it has logged since. That is
 * the whole of the bug this replaces: the run was saved, and History and Progress were
 * looking somewhere it had never been written. The backfill gave every legacy run a canonical
 * activity carrying its own identifier, so this one reader answers for both eras.
 *
 * The window is the athlete's own dates against the local date frozen on the activity, the
 * same comparison the other sports make. The old reader compared instants against
 * `started_at`, which quietly asks a different question once a profile's zone has moved.
 */
export async function readRunActivities(
  db: DbOrTx,
  userId: string,
  range: DateRange,
  page = 0,
  limit = TRAINING_RECORD_LIMIT,
): Promise<{ runs: RunActivity[]; hasMore: boolean }> {
  const records = await db
    .select({
      id: activities.id,
      startedAt: activities.startedAt,
      occurredOn: activities.occurredOn,
      durationMs: activities.durationMs,
      effortValue: activities.effortValue,
      effortStatus: activities.effortStatus,
      title: activities.title,
      notes: activities.notes,
      environment: runningActivityDetails.environment,
      distanceMetres: runningActivityDetails.distanceMetres,
      surface: runningActivityDetails.surface,
      gymId: runningActivityDetails.legacyGymId,
    })
    .from(activities)
    .innerJoin(runningActivityDetails, eq(runningActivityDetails.activityId, activities.id))
    .where(
      and(
        eq(activities.userId, userId),
        eq(activities.sport, "running"),
        eq(activities.status, "completed"),
        gte(activities.occurredOn, range.from),
        lte(activities.occurredOn, range.to),
      ),
    )
    .orderBy(desc(activities.startedAt), desc(activities.id))
    .limit(limit + 1)
    .offset(page * limit);
  return {
    hasMore: records.length > limit,
    runs: records.slice(0, limit).map((row) => {
      // A completed endurance activity always carries a duration; the database says so.
      const durationSeconds = Math.round((row.durationMs ?? 0) / 1000);
      return {
        id: row.id,
        startedAt: row.startedAt,
        occurredOn: row.occurredOn,
        environment: row.environment,
        durationSeconds,
        distanceMeters: row.distanceMetres,
        averagePaceSecondsPerKm: paceSecondsPerKm(row.distanceMetres, durationSeconds),
        effort: effortFromStorage(row.effortValue, row.effortStatus),
        surface: row.surface,
        title: row.title,
        notes: row.notes,
        gymId: row.gymId,
      };
    }),
  };
}

export async function readRecovery(db: DbOrTx, userId: string, range: DateRange) {
  return db
    .select()
    .from(dailyRecovery)
    .where(
      and(
        eq(dailyRecovery.userId, userId),
        gte(dailyRecovery.date, range.from),
        lte(dailyRecovery.date, range.to),
      ),
    )
    .orderBy(desc(dailyRecovery.date));
}

export async function readTrainingData(db: DbOrTx, userId: string, range: DateRange) {
  const [workouts, runData, recovery] = await Promise.all([
    readWorkouts(db, userId, range),
    readRunActivities(db, userId, range),
    readRecovery(db, userId, range),
  ]);
  return {
    workouts: workouts.workouts,
    runs: runData.runs,
    recovery,
    truncated: workouts.hasMore || runData.hasMore,
  };
}

export type TrainingData = Awaited<ReturnType<typeof readTrainingData>>;
export type TrainingWorkout = TrainingData["workouts"][number];
