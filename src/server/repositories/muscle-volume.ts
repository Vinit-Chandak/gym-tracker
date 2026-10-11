import { and, count, eq, isNotNull, ne } from "drizzle-orm";

import { activities, exercises, setLogs, workoutExercises, workoutSessions } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { addExerciseVolume, emptyMuscleVolume } from "@/domain/muscle-volume";
import type { DateRange } from "@/server/validation/date-range";

import { strengthOnDays, strengthParent } from "./strength-day";

/**
 * The body map needs counts, not another download of every workout, slot and set. Its week holds
 * the workouts the calendar marks on its days.
 */
export async function readMuscleVolume(db: DbOrTx, userId: string, range: DateRange) {
  const rows = await db
    .select({
      primaryMuscles: exercises.primaryMuscles,
      secondaryMuscles: exercises.secondaryMuscles,
      workingSets: count(),
    })
    .from(setLogs)
    .innerJoin(workoutExercises, eq(workoutExercises.id, setLogs.workoutExerciseId))
    .innerJoin(workoutSessions, eq(workoutSessions.id, workoutExercises.workoutSessionId))
    .leftJoin(activities, strengthParent)
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        eq(workoutExercises.userId, userId),
        eq(setLogs.userId, userId),
        isNotNull(workoutSessions.completedAt),
        strengthOnDays(range),
        ne(setLogs.setType, "warmup"),
      ),
    )
    .groupBy(exercises.id);
  const volume = emptyMuscleVolume();
  let totalSets = 0;
  for (const row of rows) {
    totalSets += row.workingSets;
    addExerciseVolume(volume, { ...row, secondaryMuscles: row.secondaryMuscles ?? [] });
  }
  return { volume, totalSets };
}
