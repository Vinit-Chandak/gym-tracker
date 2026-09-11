import { and, asc, desc, eq, exists, gte, inArray, isNotNull, lt, lte, sql } from "drizzle-orm";

import {
  dailyRecovery,
  equipmentInstances,
  exercises,
  gyms,
  programDays,
  runs,
  setLogs,
  workoutExercises,
  workoutSessions,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { DateRange } from "@/server/validation/date-range";

export const TRAINING_RECORD_LIMIT = 500;
const inRange = (range: DateRange) =>
  and(gte(workoutSessions.startedAt, range.start), lt(workoutSessions.startedAt, range.end));

/** Bounded, batched raw data shared by history, analytics and the read-only coach API. Caller enforces RLS. */
export async function readWorkouts(
  db: DbOrTx,
  userId: string,
  range: DateRange,
  page = 0,
  limit = TRAINING_RECORD_LIMIT,
  filter: {
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
              name: exercises.name,
              slug: exercises.slug,
              modality: exercises.modality,
              loadPortability: exercises.loadPortability,
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
    readRuns(db, userId, range),
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
