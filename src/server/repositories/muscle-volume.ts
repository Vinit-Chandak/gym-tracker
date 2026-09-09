import { and, count, eq, gte, isNotNull, lt, ne } from "drizzle-orm";

import { exercises, setLogs, workoutExercises, workoutSessions } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { addExerciseVolume, emptyMuscleVolume } from "@/domain/muscle-volume";
import type { DateRange } from "@/server/validation/date-range";

/** The body map needs counts, not another download of every workout, slot and set. */
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
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        eq(workoutExercises.userId, userId),
        eq(setLogs.userId, userId),
        isNotNull(workoutSessions.completedAt),
        gte(workoutSessions.startedAt, range.start),
        lt(workoutSessions.startedAt, range.end),
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
