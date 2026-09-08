import { and, asc, desc, eq, exists, inArray, lt, ne, sql } from "drizzle-orm";

import { equipmentInstances, gyms, setLogs, workoutExercises, workoutSessions } from "@/db/schema";
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
};

export type ComparablePerformance = {
  workoutExerciseId: string;
  workoutSessionId: string;
  /** The programme slot this was performed for, if any; lets the engine compare like with like. */
  plannedProgramExerciseId: string | null;
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

/** Performances of an exercise with at least one logged set, newest first. */
async function performances(
  db: DbOrTx,
  filter: PerformanceFilter,
): Promise<ComparablePerformance[]> {
  const conditions = [
    eq(workoutExercises.userId, filter.userId),
    eq(workoutExercises.exerciseId, filter.exerciseId),
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

  const rows = await db
    .select({
      workoutExerciseId: workoutExercises.id,
      workoutSessionId: workoutSessions.id,
      plannedProgramExerciseId: workoutExercises.plannedProgramExerciseId,
      gymId: workoutSessions.gymId,
      gymName: gyms.name,
      equipmentInstanceId: workoutExercises.equipmentInstanceId,
      equipmentInstanceName: equipmentInstances.name,
      performedAt: workoutSessions.startedAt,
    })
    .from(workoutExercises)
    .innerJoin(workoutSessions, eq(workoutSessions.id, workoutExercises.workoutSessionId))
    .innerJoin(gyms, eq(gyms.id, workoutSessions.gymId))
    .leftJoin(equipmentInstances, eq(equipmentInstances.id, workoutExercises.equipmentInstanceId))
    .where(and(...conditions))
    .orderBy(desc(workoutSessions.startedAt), desc(workoutExercises.orderIndex))
    .limit(filter.limit);
  if (rows.length === 0) return [];

  const sets = await db
    .select({
      workoutExerciseId: setLogs.workoutExerciseId,
      setIndex: setLogs.setIndex,
      setType: setLogs.setType,
      weight: setLogs.weight,
      unit: setLogs.unit,
      reps: setLogs.reps,
      rir: setLogs.rir,
      durationSeconds: setLogs.durationSeconds,
    })
    .from(setLogs)
    .where(
      inArray(
        setLogs.workoutExerciseId,
        rows.map((row) => row.workoutExerciseId),
      ),
    )
    .orderBy(asc(setLogs.setIndex));

  return rows.map((row) => ({
    ...row,
    sets: sets
      .filter((set) => set.workoutExerciseId === row.workoutExerciseId)
      .map(({ workoutExerciseId: _ignored, ...set }) => set),
  }));
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

/** Recent performances of an exercise on every machine, newest first, for the exercise page. */
export async function recentPerformances(
  db: DbOrTx,
  userId: string,
  exerciseId: string,
  limit = 10,
): Promise<ComparablePerformance[]> {
  return performances(db, { userId, exerciseId, limit });
}
