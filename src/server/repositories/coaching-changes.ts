import { and, asc, eq, gte, lte } from "drizzle-orm";
import { coachChangeRecords } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { TRAINING_POLICY } from "@/domain/training-evidence";

/** Decisions are shared by the daily coach, weekly review and fallback targets. */
export function readCoachingChanges(db: DbOrTx, userId: string, end = new Date()) {
  return db
    .select()
    .from(coachChangeRecords)
    .where(
      and(
        eq(coachChangeRecords.userId, userId),
        gte(
          coachChangeRecords.createdAt,
          new Date(end.getTime() - TRAINING_POLICY.trendDays * 86_400_000),
        ),
        lte(coachChangeRecords.createdAt, end),
      ),
    )
    .orderBy(asc(coachChangeRecords.createdAt));
}
