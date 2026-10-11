import { and, eq, exists, gt, isNotNull, isNull, ne, sql } from "drizzle-orm";

import { setLogs, workoutExercises, workoutSessions } from "@/db/schema";
import type { DbOrTx } from "@/db/types";

const POUND = 0.45359237;

export type ExerciseMonth = {
  /** "2026-09", in the account's time zone. */
  month: string;
  /** The heaviest working set's load that month, in kilograms. */
  topKg: number;
};

/**
 * An exercise across its whole life (board Exercise: "Heaviest set each month"): the heaviest
 * working set of each month it was done in, and how many finished sessions it was done in, with
 * at least one set beyond its warm-ups. Warm-ups are not counted; neither is an unweighted set
 * in a month's heaviest. A machine's loads are its own, so a movement bound to its machine is
 * read on one machine only.
 */
export async function readExerciseLife(
  tx: DbOrTx,
  userId: string,
  exerciseId: string,
  timeZone: string,
  equipmentInstanceId: string | null = null,
): Promise<{ months: ExerciseMonth[]; sessions: number }> {
  const onMachine = equipmentInstanceId
    ? eq(workoutExercises.equipmentInstanceId, equipmentInstanceId)
    : undefined;
  const month = sql<string>`to_char(date_trunc('month', ${workoutSessions.startedAt} at time zone ${timeZone}), 'YYYY-MM')`;
  const [months, [count]] = await Promise.all([
    tx
      .select({
        month,
        topKg: sql<string>`max(case when ${setLogs.unit} = 'lb' then ${setLogs.weight} * ${POUND} else ${setLogs.weight} end)`,
      })
      .from(setLogs)
      .innerJoin(workoutExercises, eq(workoutExercises.id, setLogs.workoutExerciseId))
      .innerJoin(workoutSessions, eq(workoutSessions.id, workoutExercises.workoutSessionId))
      .where(
        and(
          eq(setLogs.userId, userId),
          eq(workoutExercises.exerciseId, exerciseId),
          isNotNull(workoutSessions.completedAt),
          isNull(workoutExercises.skippedAt),
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
          // A session it was only planned in, skipped or left out of is not one it was in.
          isNull(workoutExercises.skippedAt),
          exists(
            tx
              .select({ one: sql`1` })
              .from(setLogs)
              .where(
                and(
                  eq(setLogs.workoutExerciseId, workoutExercises.id),
                  ne(setLogs.setType, "warmup"),
                ),
              ),
          ),
          onMachine,
        ),
      ),
  ]);
  return {
    months: months.map((row) => ({ month: row.month, topKg: Number(row.topKg) })),
    sessions: count?.sessions ?? 0,
  };
}
