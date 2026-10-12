import { and, eq, inArray, sql } from "drizzle-orm";

import { workoutSessions } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { StoredPlanExercise } from "@/domain/session-plan";
import {
  ownEntry,
  pairBySlot,
  plannedWorkingSets,
  type PrintedSession,
} from "@/domain/session-print";

type PrintExerciseRow = {
  slotId: string | null;
  exerciseId: string;
  /** The programme slot's sets, while the slot is still there. */
  programmeSets: number | null;
  /** A saved routine's sets, copied when it was started. */
  savedSets: number | null;
  skipped: boolean;
  supersetGroup: string | null;
  work: number;
  warm: number;
};

/**
 * What a workout's print is made of (`PrintedSession`), read in the statement that reads its
 * session row, as a nested select beside it: `print: sessionPrintColumns()`. Every count is
 * correlated to `workout_sessions` there, so it costs no statement of its own (ADR 0030); the
 * same columns serve the open workout every screen reads and the workouts of a day.
 *
 * The plan is the one the workout itself reads (`getSessionDetail`): the coach's plan it was
 * started from, its warm-up's lines and its sets, else the programme day's protocol and slots,
 * or a saved routine's.
 */
export function sessionPrintColumns() {
  // Explicit qualifiers keep correlated columns intact in Drizzle's select list.
  return {
    completedAt: workoutSessions.completedAt,
    warmupCompleted: workoutSessions.warmupCompleted,
    protocolDrills: sql<number | null>`(
      select jsonb_array_length(wp.drills) from program_days pd
      join warmup_protocols wp on wp.id = pd.warmup_protocol_id
      where pd.id = workout_sessions.program_day_id
    )`,
    // The latest plan the session was started from, as `planForSession` takes it.
    coachPlan: sql<{ warmup: string[]; exercises: StoredPlanExercise[] } | null>`(
      select json_build_object('warmup', sp.warmup, 'exercises', sp.exercises)
      from session_plans sp
      where sp.workout_session_id = workout_sessions.id
      order by sp.consumed_at desc
      limit 1
    )`,
    exercises: sql<PrintExerciseRow[]>`coalesce((
      select json_agg(json_build_object(
        'slotId', we.planned_program_exercise_id,
        'exerciseId', we.exercise_id,
        'programmeSets', pe.sets,
        'savedSets', we.saved_prescription -> 'sets',
        'skipped', we.skipped_at is not null,
        'supersetGroup', we.superset_group,
        'work', (
          select count(*) from set_logs sl
          where sl.workout_exercise_id = we.id and sl.set_type <> 'warmup'
        ),
        'warm', (
          select count(*) from set_logs sl
          where sl.workout_exercise_id = we.id and sl.set_type = 'warmup'
        )
      ) order by we.order_index)
      from workout_exercises we
      left join program_exercises pe on pe.id = we.planned_program_exercise_id
      where we.workout_session_id = workout_sessions.id
    ), '[]'::json)`,
  };
}

export type SessionPrintRow = {
  completedAt: Date | null;
  warmupCompleted: boolean;
  protocolDrills: number | null;
  coachPlan: { warmup: string[]; exercises: StoredPlanExercise[] } | null;
  exercises: PrintExerciseRow[];
};

/**
 * The columns as the print reads them: the coach's warm-up stands in for the protocol, and each
 * exercise asks for the sets the workout's own rows ask for (`plannedSets`), its coach's entry
 * paired with it as the workout pairs them.
 */
export function printedSessionOf(row: SessionPrintRow): PrintedSession {
  const entries = pairBySlot(row.exercises, row.coachPlan?.exercises ?? []);
  return {
    drills: row.coachPlan?.warmup.length || row.protocolDrills || 0,
    warmupCompleted: row.warmupCompleted,
    completed: row.completedAt !== null,
    exercises: row.exercises.map((exercise, index) => ({
      slotId: exercise.slotId,
      exerciseId: exercise.exerciseId,
      planned: plannedWorkingSets(
        ownEntry(entries[index] ?? null, exercise.exerciseId),
        exercise.programmeSets ?? exercise.savedSets ?? null,
      ),
      work: Number(exercise.work),
      warm: Number(exercise.warm),
      skipped: exercise.skipped,
      supersetGroup: exercise.supersetGroup,
    })),
  };
}

/** The prints of the athlete's workouts named, by session: a day's, read after its workouts. */
export async function readSessionPrints(
  db: DbOrTx,
  userId: string,
  sessionIds: readonly string[],
): Promise<Map<string, PrintedSession>> {
  if (sessionIds.length === 0) return new Map();
  const rows = await db
    .select({ id: workoutSessions.id, print: sessionPrintColumns() })
    .from(workoutSessions)
    .where(and(eq(workoutSessions.userId, userId), inArray(workoutSessions.id, [...sessionIds])));
  return new Map(rows.map((row) => [row.id, printedSessionOf(row.print)]));
}
