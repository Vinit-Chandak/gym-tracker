import { and, asc, desc, eq, exists, lt, ne, sql } from "drizzle-orm";

import { gyms, setLogs, workoutExercises, workoutSessions } from "@/db/schema";
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
  gymId: string;
  gymName: string;
  equipmentInstanceId: string | null;
  performedAt: Date;
  sets: ComparableSet[];
};

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
};

/**
 * The most recent comparable performance with at least one logged set.
 * Free-weight exercises compare across gyms; machine exercises only on the same machine.
 */
export async function previousComparablePerformance(
  db: DbOrTx,
  query: ComparableQuery,
): Promise<ComparablePerformance | null> {
  const scope = comparisonScope(query.loadPortability);
  if (scope === "equipment_instance" && query.equipmentInstanceId === null) return null;

  const conditions = [
    eq(workoutExercises.userId, query.userId),
    eq(workoutExercises.exerciseId, query.exerciseId),
    exists(
      db
        .select({ one: sql`1` })
        .from(setLogs)
        .where(eq(setLogs.workoutExerciseId, workoutExercises.id)),
    ),
  ];
  if (scope === "equipment_instance" && query.equipmentInstanceId !== null) {
    conditions.push(eq(workoutExercises.equipmentInstanceId, query.equipmentInstanceId));
  }
  if (query.before) conditions.push(lt(workoutSessions.startedAt, query.before));
  if (query.excludeWorkoutExerciseId) {
    conditions.push(ne(workoutExercises.id, query.excludeWorkoutExerciseId));
  }

  const [row] = await db
    .select({
      workoutExerciseId: workoutExercises.id,
      workoutSessionId: workoutSessions.id,
      gymId: workoutSessions.gymId,
      gymName: gyms.name,
      equipmentInstanceId: workoutExercises.equipmentInstanceId,
      performedAt: workoutSessions.startedAt,
    })
    .from(workoutExercises)
    .innerJoin(workoutSessions, eq(workoutSessions.id, workoutExercises.workoutSessionId))
    .innerJoin(gyms, eq(gyms.id, workoutSessions.gymId))
    .where(and(...conditions))
    .orderBy(desc(workoutSessions.startedAt))
    .limit(1);
  if (!row) return null;

  const sets = await db
    .select({
      setIndex: setLogs.setIndex,
      setType: setLogs.setType,
      weight: setLogs.weight,
      unit: setLogs.unit,
      reps: setLogs.reps,
      rir: setLogs.rir,
      durationSeconds: setLogs.durationSeconds,
    })
    .from(setLogs)
    .where(eq(setLogs.workoutExerciseId, row.workoutExerciseId))
    .orderBy(asc(setLogs.setIndex));

  return { ...row, sets };
}
