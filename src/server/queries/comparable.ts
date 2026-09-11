import { and, desc, eq, exists, isNotNull, lt, ne, sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";

import {
  equipmentInstances,
  gyms,
  programExercises,
  setLogs,
  workoutExercises,
  workoutSessions,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { comparisonScope } from "@/domain/comparable-history";
import type { LoadPortability, LoadUnit, SetType } from "@/domain/types";

export type ComparableSet = {
  setIndex: number;
  setType: SetType;
  weight: number | null;
  unit: LoadUnit;
  reps: number | null;
  rir: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

export type ComparablePerformance = {
  workoutExerciseId: string;
  workoutSessionId: string;
  /** The programme slot this was performed for, if any; lets the engine compare like with like. */
  plannedProgramExerciseId: string | null;
  /**
   * That slot's identity across programme versions. A revision clones every slot into new
   * rows, so this is what still says "the squat slot of Lower A" afterwards.
   */
  plannedSlotLineageId: string | null;
  gymId: string;
  gymName: string;
  equipmentInstanceId: string | null;
  equipmentInstanceName: string | null;
  performedAt: Date;
  sets: ComparableSet[];
};

type PerformanceFilter = {
  userId: string;
  exerciseId: string;
  /** Restrict to one machine; leave undefined for any equipment (or none). */
  equipmentInstanceId?: string;
  before?: Date;
  excludeWorkoutExerciseId?: string;
  limit: number;
};

/** Completed-workout performances with at least one logged set, newest first. */
function performanceQuery(db: DbOrTx, filter: PerformanceFilter, requestIndex: number) {
  const conditions = [
    eq(workoutExercises.userId, filter.userId),
    eq(workoutSessions.userId, filter.userId),
    eq(workoutExercises.exerciseId, filter.exerciseId),
    isNotNull(workoutSessions.completedAt),
    exists(
      db
        .select({ one: sql`1` })
        .from(setLogs)
        .where(eq(setLogs.workoutExerciseId, workoutExercises.id)),
    ),
  ];
  if (filter.equipmentInstanceId !== undefined) {
    conditions.push(eq(workoutExercises.equipmentInstanceId, filter.equipmentInstanceId));
  }
  if (filter.before) conditions.push(lt(workoutSessions.startedAt, filter.before));
  if (filter.excludeWorkoutExerciseId) {
    conditions.push(ne(workoutExercises.id, filter.excludeWorkoutExerciseId));
  }

  return db
    .select({
      requestIndex: sql<number>`${requestIndex}::int`,
      workoutExerciseId: workoutExercises.id,
      workoutSessionId: workoutSessions.id,
      plannedProgramExerciseId: workoutExercises.plannedProgramExerciseId,
      plannedSlotLineageId: programExercises.lineageId,
      gymId: workoutSessions.gymId,
      gymName: gyms.name,
      equipmentInstanceId: workoutExercises.equipmentInstanceId,
      equipmentInstanceName: equipmentInstances.name,
      performedAt: workoutSessions.startedAt,
      // Each performance carries its sets, so a batch of histories is a single statement.
      // Plain SQL on purpose: inside a select list Drizzle drops table qualifiers (see listGyms).
      sets: sql<ComparableSet[]>`coalesce((
        select json_agg(json_build_object(
          'setIndex', s.set_index,
          'setType', s.set_type,
          'weight', s.weight,
          'unit', s.unit,
          'reps', s.reps,
          'rir', s.rir,
          'durationSeconds', s.duration_seconds,
          'distanceMeters', s.distance_meters
        ) order by s.set_index)
        from set_logs s where s.workout_exercise_id = workout_exercises.id
      ), '[]'::json)`,
    })
    .from(workoutExercises)
    .innerJoin(workoutSessions, eq(workoutSessions.id, workoutExercises.workoutSessionId))
    .innerJoin(gyms, eq(gyms.id, workoutSessions.gymId))
    .leftJoin(equipmentInstances, eq(equipmentInstances.id, workoutExercises.equipmentInstanceId))
    .leftJoin(programExercises, eq(programExercises.id, workoutExercises.plannedProgramExerciseId))
    .where(and(...conditions))
    .orderBy(desc(workoutSessions.startedAt), desc(workoutExercises.orderIndex))
    .limit(filter.limit);
}

/** All exercise lookups in one round trip, with a separate limit for each comparison scope. */
async function batchPerformances(
  db: DbOrTx,
  filters: PerformanceFilter[],
): Promise<ComparablePerformance[][]> {
  if (filters.length === 0) return [];
  const queries = filters.map((filter, i) => performanceQuery(db, filter, i));
  const first = queries[0]!;
  const rows = await (queries.length === 1
    ? first
    : unionAll(first, queries[1]!, ...queries.slice(2)));
  return filters.map((_, i) =>
    rows.filter((row) => row.requestIndex === i).map(({ requestIndex: _ignored, ...row }) => row),
  );
}

async function performances(
  db: DbOrTx,
  filter: PerformanceFilter,
): Promise<ComparablePerformance[]> {
  return (await batchPerformances(db, [filter]))[0] ?? [];
}

export type ComparableQuery = {
  userId: string;
  exerciseId: string;
  loadPortability: LoadPortability;
  /** The machine about to be used; required for equipment-specific exercises. */
  equipmentInstanceId: string | null;
  /** Only consider sessions started before this moment. */
  before?: Date;
  /** Ignore the exercise currently being logged. */
  excludeWorkoutExerciseId?: string;
  /** How many performances to return (default 6). */
  limit?: number;
};

export async function sessionHistories(db: DbOrTx, queries: ComparableQuery[]) {
  const filters: PerformanceFilter[] = [];
  const indices = queries.map((query) => {
    const machine = comparisonScope(query.loadPortability) === "equipment_instance";
    const base = {
      userId: query.userId,
      exerciseId: query.exerciseId,
      before: query.before,
      excludeWorkoutExerciseId: query.excludeWorkoutExerciseId,
    };
    const comparable = !machine || query.equipmentInstanceId !== null ? filters.length : null;
    if (comparable !== null)
      filters.push({
        ...base,
        equipmentInstanceId: machine ? query.equipmentInstanceId! : undefined,
        limit: query.limit ?? 6,
      });
    const elsewhere = machine && query.equipmentInstanceId !== null ? filters.length : null;
    if (elsewhere !== null) filters.push({ ...base, limit: 1 });
    return { comparable, elsewhere };
  });
  const results = await batchPerformances(db, filters);
  return indices.map(({ comparable, elsewhere }) => ({
    history: comparable === null ? [] : (results[comparable] ?? []),
    elsewhere: elsewhere === null ? null : (results[elsewhere]?.[0] ?? null),
  }));
}

/**
 * Comparable performances, newest first. Free-weight exercises compare across gyms; machine
 * exercises only on the same machine, and never when the machine is unknown.
 */
export async function comparableHistory(
  db: DbOrTx,
  query: ComparableQuery,
): Promise<ComparablePerformance[]> {
  const scope = comparisonScope(query.loadPortability);
  if (scope === "equipment_instance" && query.equipmentInstanceId === null) return [];
  return performances(db, {
    userId: query.userId,
    exerciseId: query.exerciseId,
    equipmentInstanceId:
      scope === "equipment_instance" && query.equipmentInstanceId !== null
        ? query.equipmentInstanceId
        : undefined,
    before: query.before,
    excludeWorkoutExerciseId: query.excludeWorkoutExerciseId,
    limit: query.limit ?? 6,
  });
}

/** The most recent comparable performance with at least one logged set. */
export async function previousComparablePerformance(
  db: DbOrTx,
  query: ComparableQuery,
): Promise<ComparablePerformance | null> {
  const [row] = await comparableHistory(db, { ...query, limit: 1 });
  return row ?? null;
}

/**
 * The latest performance of an exercise on any equipment. Only a starting guess for a machine
 * with no history of its own; never a comparable for progression.
 */
export async function latestPerformanceAnywhere(
  db: DbOrTx,
  query: Pick<ComparableQuery, "userId" | "exerciseId" | "before" | "excludeWorkoutExerciseId">,
): Promise<ComparablePerformance | null> {
  const [row] = await performances(db, { ...query, limit: 1 });
  return row ?? null;
}

/** Recent completed performances on every machine, newest first, for the exercise page. */
export async function recentPerformances(
  db: DbOrTx,
  userId: string,
  exerciseId: string,
  limit = 10,
): Promise<ComparablePerformance[]> {
  return performances(db, { userId, exerciseId, limit });
}
