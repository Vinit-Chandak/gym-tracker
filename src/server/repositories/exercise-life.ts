import { and, eq, gt, isNotNull, ne, sql } from "drizzle-orm";

import {
  activities,
  equipmentInstances,
  equipmentTypes,
  setLogs,
  workoutExercises,
  workoutSessions,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { ASSISTED_EQUIPMENT_TYPES } from "@/domain/load-steps";

import { strengthDay, strengthParent } from "./strength-day";

const POUND = 0.45359237;

export type ExerciseMonth = {
  /** "2026-09": the month of the day each workout is dated on (`strengthDay`). */
  month: string;
  /**
   * The best working set's load that month, in kilograms: the heaviest, or on an assisted
   * machine the least help.
   */
  topKg: number;
};

/**
 * An exercise across its whole life (board Exercise: "Heaviest set each month"): the best
 * working set of each month it was done in, and how many finished sessions it was in. Warm-ups
 * are not counted; neither is an unweighted set. A machine's loads are its own, so a movement
 * bound to its machine is read on one machine only. On an assisted machine (`assisted`) the
 * number is help given, so a month's best is its least (ADR 0048).
 */
export async function readExerciseLife(
  tx: DbOrTx,
  userId: string,
  exerciseId: string,
  timeZone: string,
  equipmentInstanceId: string | null = null,
): Promise<{ months: ExerciseMonth[]; sessions: number; assisted: boolean }> {
  const onMachine = equipmentInstanceId
    ? eq(workoutExercises.equipmentInstanceId, equipmentInstanceId)
    : undefined;
  // The month of the day the calendar marks the workout on.
  const month = sql<string>`left(${strengthDay(timeZone)}, 7)`;
  const kilograms = sql`case when ${setLogs.unit} = 'lb' then ${setLogs.weight} * ${POUND} else ${setLogs.weight} end`;
  const [months, [count], [machine]] = await Promise.all([
    tx
      .select({
        month,
        heaviestKg: sql<string>`max(${kilograms})`,
        lightestKg: sql<string>`min(${kilograms})`,
      })
      .from(setLogs)
      .innerJoin(workoutExercises, eq(workoutExercises.id, setLogs.workoutExerciseId))
      .innerJoin(workoutSessions, eq(workoutSessions.id, workoutExercises.workoutSessionId))
      .leftJoin(activities, strengthParent)
      .where(
        and(
          eq(setLogs.userId, userId),
          eq(workoutExercises.exerciseId, exerciseId),
          isNotNull(workoutSessions.completedAt),
          ne(setLogs.setType, "warmup"),
          gt(setLogs.weight, 0),
          onMachine,
        ),
      )
      // By position: the month's expression carries the time zone as a parameter, and a
      // second copy of it would be a different expression to Postgres.
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    tx
      .select({ sessions: sql<number>`count(distinct ${workoutSessions.id})::int` })
      .from(workoutExercises)
      .innerJoin(workoutSessions, eq(workoutSessions.id, workoutExercises.workoutSessionId))
      .where(
        and(
          eq(workoutExercises.userId, userId),
          eq(workoutExercises.exerciseId, exerciseId),
          isNotNull(workoutSessions.completedAt),
          onMachine,
        ),
      ),
    // The machine's type says whether its number is help, as its load ladder reads it.
    equipmentInstanceId
      ? tx
          .select({ type: equipmentTypes.slug })
          .from(equipmentInstances)
          .innerJoin(equipmentTypes, eq(equipmentTypes.id, equipmentInstances.equipmentTypeId))
          .where(
            and(
              eq(equipmentInstances.id, equipmentInstanceId),
              eq(equipmentInstances.userId, userId),
            ),
          )
      : Promise.resolve([]),
  ]);
  const assisted = machine !== undefined && ASSISTED_EQUIPMENT_TYPES.has(machine.type);
  return {
    months: months.map((row) => ({
      month: row.month,
      topKg: Number(assisted ? row.lightestKg : row.heaviestKg),
    })),
    sessions: count?.sessions ?? 0,
    assisted,
  };
}
