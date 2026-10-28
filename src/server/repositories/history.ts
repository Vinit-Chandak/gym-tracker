import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

import { activities, gyms, programDays, workoutSessions } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { DateRange } from "@/server/validation/date-range";

import { readActivityList } from "./activity-analytics";
import { strengthOnDays, strengthParent } from "./strength-day";
import { readRecovery, readRunActivities, TRAINING_RECORD_LIMIT } from "./training-data";

type HistoryExercise = {
  exerciseId: string;
  name: string;
  machineId: string | null;
  machineName: string | null;
  /** A set was logged on it: what an unplanned workout is named by (`sessionName`). */
  logged: boolean;
};

/**
 * History needs labels and a count of working sets, not every prescription and logged set. Each workout is
 * read on, and listed under, the day its parent froze (`strengthOnDays`), as the calendar marks
 * it; `occurredOn` is null only for a session older than the parents.
 */
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
      occurredOn: activities.occurredOn,
      gymId: workoutSessions.gymId,
      gymName: gyms.name,
      dayName: programDays.name,
      /** The saved routine's name it was started from, as it was then (`sessionName`). */
      title: activities.title,
      sleepHours: workoutSessions.sleepHours,
      // Explicit qualifiers keep correlated columns intact in Drizzle's select list. The sets
      // are counted as the workout lists them, warm-ups aside (`workingSetCount`).
      setCount: sql<number>`(
        select count(*) from set_logs s
        join workout_exercises e on e.id = s.workout_exercise_id
        where e.workout_session_id = workout_sessions.id and s.set_type <> 'warmup'
      )::int`,
      exercises: sql<HistoryExercise[]>`coalesce((
        select json_agg(json_build_object(
          'exerciseId', e.exercise_id,
          'name', x.name,
          'machineId', m.id,
          'machineName', m.name,
          'logged', exists(select 1 from set_logs s where s.workout_exercise_id = e.id)
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
    .leftJoin(activities, strengthParent)
    .where(
      and(
        eq(workoutSessions.userId, userId),
        isNotNull(workoutSessions.completedAt),
        strengthOnDays(range),
      ),
    )
    .orderBy(desc(workoutSessions.startedAt), desc(workoutSessions.id))
    .limit(limit + 1);
  return { workouts: rows.slice(0, limit), hasMore: rows.length > limit };
}

/**
 * Everything History lists over a range: workouts, runs, rides and swims each read as deep as
 * the others (ADR 0044), and the recovery readings. A reader that stopped short says so.
 */
export async function readHistory(db: DbOrTx, userId: string, range: DateRange) {
  const [workouts, runs, endurance, recovery] = await Promise.all([
    readHistoryWorkouts(db, userId, range),
    readRunActivities(db, userId, range),
    // From the same table as the runs, by a reader that does not hand back a run's pace or
    // the gym a migrated run named: rides and swims need neither.
    readActivityList(db, userId, {
      sports: ["cycling", "swimming"],
      from: range.from,
      to: range.to,
      limit: TRAINING_RECORD_LIMIT,
    }),
    readRecovery(db, userId, range),
  ]);
  return {
    workouts: workouts.workouts,
    runs: runs.runs,
    endurance: endurance.items,
    recovery,
    /** Which readers stopped short of the range: their oldest row is where the list is whole. */
    workoutsTruncated: workouts.hasMore,
    runsTruncated: runs.hasMore,
    enduranceTruncated: endurance.nextCursor !== null,
  };
}
