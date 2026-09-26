import { and, eq, gte, isNotNull, lt, lte, or } from "drizzle-orm";
import { dailyRecovery, workoutSessions } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { RecoveryReading } from "@/domain/recovery";
import { todayInTimeZone } from "@/domain/program-calendar";
import type { DateRange } from "@/server/validation/date-range";

/** Recovery is a saved check-in, including an open workout, not a sample of exercise history. */
export async function readRecoveryHistory(
  db: DbOrTx,
  userId: string,
  range: DateRange,
  timeZone: string,
): Promise<RecoveryReading[]> {
  const columns = (table: typeof workoutSessions | typeof dailyRecovery) => ({
    id: table.id,
    sleepHours: table.sleepHours,
    sleepQuality: table.sleepQuality,
    energy: table.energy,
    fatigue: table.fatigue,
    soreness: table.soreness,
  });
  const hasReading = (table: typeof workoutSessions | typeof dailyRecovery) =>
    or(
      isNotNull(table.sleepHours),
      isNotNull(table.sleepQuality),
      isNotNull(table.energy),
      isNotNull(table.fatigue),
      isNotNull(table.soreness),
    );
  const [workouts, daily] = await Promise.all([
    db
      .select({ ...columns(workoutSessions), startedAt: workoutSessions.startedAt })
      .from(workoutSessions)
      .where(
        and(
          eq(workoutSessions.userId, userId),
          gte(workoutSessions.startedAt, range.start),
          lt(workoutSessions.startedAt, range.end),
          hasReading(workoutSessions),
        ),
      ),
    db
      .select({
        ...columns(dailyRecovery),
        date: dailyRecovery.date,
        createdAt: dailyRecovery.createdAt,
      })
      .from(dailyRecovery)
      .where(
        and(
          eq(dailyRecovery.userId, userId),
          gte(dailyRecovery.date, range.from),
          lte(dailyRecovery.date, range.to),
          hasReading(dailyRecovery),
        ),
      ),
  ]);
  return [
    ...workouts.map(({ startedAt, ...reading }) => ({
      ...reading,
      date: todayInTimeZone(timeZone, startedAt),
      recordedAt: startedAt.toISOString(),
      source: "workout" as const,
      sessionId: reading.id,
    })),
    ...daily.map(({ createdAt, ...reading }) => ({
      ...reading,
      recordedAt: createdAt.toISOString(),
      source: "daily" as const,
      sessionId: null,
    })),
  ].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.recordedAt.localeCompare(b.recordedAt) ||
      a.id.localeCompare(b.id),
  );
}
