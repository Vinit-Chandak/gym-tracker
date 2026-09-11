import { and, count, eq, gte, isNotNull, lt, lte, ne, sql, sum } from "drizzle-orm";

import { exercises, runs, setLogs, workoutExercises, workoutSessions } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { addExerciseVolume, emptyMuscleVolume, type MuscleVolume } from "@/domain/muscle-volume";
import { addDays, todayInTimeZone } from "@/domain/program-calendar";
import { weekStart } from "@/domain/running";
import type { MuscleGroup } from "@/domain/types";
import { parseDateRange } from "@/server/validation/date-range";

/**
 * Complete calendar-week aggregates, independent of narrative/history limits. The current
 * week stops at the snapshot; older weeks are complete. These are athlete-local chart weeks,
 * not the owner's scheduled seven-day review periods or the program's repeating cycles.
 */
export async function readWeeklyTrainingVolume(
  db: DbOrTx,
  userId: string,
  timeZone: string,
  snapshot: Date,
  weeks: number,
) {
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52)
    throw new Error("Choose between one and 52 calendar weeks.");
  const current = weekStart(todayInTimeZone(timeZone, snapshot));
  const range = parseDateRange({ from: addDays(current, -7 * (weeks - 1)), to: current }, timeZone);
  const workoutWeek =
    sql<string>`to_char(date_trunc('week', ${workoutSessions.startedAt} at time zone ${timeZone}), 'YYYY-MM-DD')`.as(
      "week_start",
    );
  const runWeek =
    sql<string>`to_char(date_trunc('week', ${runs.startedAt} at time zone ${timeZone}), 'YYYY-MM-DD')`.as(
      "week_start",
    );
  const workoutRange = and(
    eq(workoutSessions.userId, userId),
    gte(workoutSessions.startedAt, range.start),
    lt(workoutSessions.startedAt, snapshot),
  );
  const [lifting, running, sessions] = await Promise.all([
    db
      .select({
        weekStart: workoutWeek,
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
          workoutRange,
          eq(workoutExercises.userId, userId),
          eq(setLogs.userId, userId),
          isNotNull(workoutSessions.completedAt),
          lte(workoutSessions.completedAt, snapshot),
          ne(setLogs.setType, "warmup"),
        ),
      )
      .groupBy(sql`week_start`, exercises.id),
    db
      .select({
        weekStart: runWeek,
        runs: count(),
        seconds: sum(runs.durationSeconds),
        meters: sum(runs.distanceMeters),
      })
      .from(runs)
      .where(
        and(
          eq(runs.userId, userId),
          gte(runs.startedAt, range.start),
          lt(runs.startedAt, snapshot),
        ),
      )
      .groupBy(sql`week_start`),
    db
      .select({
        weekStart: workoutWeek,
        completed:
          sql<number>`count(*) filter (where ${workoutSessions.completedAt} <= ${snapshot.toISOString()})`.mapWith(
            Number,
          ),
        incomplete:
          sql<number>`count(*) filter (where ${workoutSessions.completedAt} is null or ${workoutSessions.completedAt} > ${snapshot.toISOString()})`.mapWith(
            Number,
          ),
      })
      .from(workoutSessions)
      .where(workoutRange)
      .groupBy(sql`week_start`),
  ]);
  return Array.from({ length: weeks }, (_, index) => {
    const start = addDays(current, -7 * index);
    const bounds = parseDateRange({ from: start, to: addDays(start, 6) }, timeZone);
    const volume = emptyMuscleVolume();
    let totalSets = 0;
    for (const row of lifting.filter((row) => row.weekStart === start)) {
      totalSets += row.workingSets;
      addExerciseVolume(volume, { ...row, secondaryMuscles: row.secondaryMuscles ?? [] });
    }
    const byMuscle: Partial<MuscleVolume> = {};
    for (const [muscle, sets] of Object.entries(volume) as [MuscleGroup, number][]) {
      if (sets > 0) byMuscle[muscle] = Math.round(sets * 10) / 10;
    }
    const run = running.find((row) => row.weekStart === start);
    const session = sessions.find((row) => row.weekStart === start);
    return {
      weekStart: start,
      lifting: { totalSets, byMuscle },
      running: {
        runs: run?.runs ?? 0,
        minutes: Math.round(Number(run?.seconds ?? 0) / 60),
        km: Math.round(Number(run?.meters ?? 0) / 100) / 10,
      },
      coverage: {
        start: bounds.start.toISOString(),
        end: new Date(Math.min(bounds.end.getTime(), snapshot.getTime())).toISOString(),
        partial: bounds.end > snapshot,
        completedWorkouts: session?.completed ?? 0,
        incompleteWorkouts: session?.incomplete ?? 0,
      },
    };
  });
}
