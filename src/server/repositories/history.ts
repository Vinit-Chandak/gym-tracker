import { and, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";

import { gyms, programDays, workoutSessions } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { DateRange } from "@/server/validation/date-range";

import { readRecovery, readRuns, TRAINING_RECORD_LIMIT } from "./training-data";

type HistoryExercise = {
  exerciseId: string;
  name: string;
  machineId: string | null;
  machineName: string | null;
};

/** History needs labels and a set count, not every prescription and logged set. */
export async function readHistoryWorkouts(
  db: DbOrTx,
  userId: string,
  range: DateRange,
  limit = TRAINING_RECORD_LIMIT,
) {
  const rows = await db
    .select({
      id: workoutSessions.id,
      startedAt: workoutSessions.startedAt,
      gymId: workoutSessions.gymId,
      gymName: gyms.name,
      dayName: programDays.name,
      sleepHours: workoutSessions.sleepHours,
      backPainPre: workoutSessions.backPainPre,
      shinLeftPre: workoutSessions.shinLeftPre,
      shinRightPre: workoutSessions.shinRightPre,
      // Explicit qualifiers keep correlated columns intact in Drizzle's select list.
      setCount: sql<number>`(
        select count(*) from set_logs s
        join workout_exercises e on e.id = s.workout_exercise_id
        where e.workout_session_id = workout_sessions.id
      )::int`,
      exercises: sql<HistoryExercise[]>`coalesce((
        select json_agg(json_build_object(
          'exerciseId', e.exercise_id,
          'name', x.name,
          'machineId', m.id,
          'machineName', m.name
        ) order by e.order_index)
        from workout_exercises e
        join exercises x on x.id = e.exercise_id
        left join equipment_instances m on m.id = e.equipment_instance_id
        where e.workout_session_id = workout_sessions.id
      ), '[]'::json)`,
    })
    .from(workoutSessions)
    .innerJoin(gyms, eq(gyms.id, workoutSessions.gymId))
    .leftJoin(programDays, eq(programDays.id, workoutSessions.programDayId))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        isNotNull(workoutSessions.completedAt),
        gte(workoutSessions.startedAt, range.start),
        lt(workoutSessions.startedAt, range.end),
      ),
    )
    .orderBy(desc(workoutSessions.startedAt), desc(workoutSessions.id))
    .limit(limit + 1);
  return { workouts: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function readHistory(db: DbOrTx, userId: string, range: DateRange) {
  const [workouts, runs, recovery] = await Promise.all([
    readHistoryWorkouts(db, userId, range),
    readRuns(db, userId, range),
    readRecovery(db, userId, range),
  ]);
  return {
    workouts: workouts.workouts,
    runs: runs.runs,
    recovery,
    truncated: workouts.hasMore || runs.hasMore,
  };
}
