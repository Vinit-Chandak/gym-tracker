import { and, desc, eq, gte, lte } from "drizzle-orm";

import { bodyWeightLogs, profiles } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { DateRange } from "@/server/validation/date-range";

/** One reading: what the scale said, and the day it said it. */
export type BodyWeightReading = { measuredOn: string; weightKg: number };

/**
 * Records a reading and re-points the profile at whichever reading is now the newest.
 *
 * A day holds one reading, so weighing yourself again — or finishing a second session — corrects
 * the day rather than adding a second point to the trend. The profile's own body weight is never
 * written anywhere else, which is what keeps "what I weigh" and the chart behind it in step even
 * when a reading is entered for a day in the past.
 */
export async function recordBodyWeight(
  db: DbOrTx,
  userId: string,
  reading: BodyWeightReading,
): Promise<void> {
  await db
    .insert(bodyWeightLogs)
    .values({ userId, measuredOn: reading.measuredOn, weightKg: reading.weightKg })
    .onConflictDoUpdate({
      target: [bodyWeightLogs.userId, bodyWeightLogs.measuredOn],
      set: { weightKg: reading.weightKg, updatedAt: new Date() },
    });

  const [newest] = await db
    .select({ weightKg: bodyWeightLogs.weightKg })
    .from(bodyWeightLogs)
    .where(eq(bodyWeightLogs.userId, userId))
    .orderBy(desc(bodyWeightLogs.measuredOn))
    .limit(1);
  if (!newest) return;
  await db.update(profiles).set({ bodyWeightKg: newest.weightKg }).where(eq(profiles.id, userId));
}

/** Every reading inside the range, oldest first — the order a trend is drawn in. */
export async function listBodyWeights(
  db: DbOrTx,
  userId: string,
  range: Pick<DateRange, "from" | "to">,
): Promise<BodyWeightReading[]> {
  return db
    .select({ measuredOn: bodyWeightLogs.measuredOn, weightKg: bodyWeightLogs.weightKg })
    .from(bodyWeightLogs)
    .where(
      and(
        eq(bodyWeightLogs.userId, userId),
        gte(bodyWeightLogs.measuredOn, range.from),
        lte(bodyWeightLogs.measuredOn, range.to),
      ),
    )
    .orderBy(bodyWeightLogs.measuredOn);
}
