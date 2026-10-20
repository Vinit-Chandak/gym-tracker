import { and, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";

import { activities, profiles, runningActivityDetails } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { runPeakHeartRate, type RunningActualV1 } from "@/domain/activity-metrics";
import {
  PLAUSIBLE_MAX_HEART_RATE,
  raisedMaxHeartRate,
  resolveHeartRate,
  type HeartRateSettings,
  type ObservedMax,
  type ResolvedHeartRate,
} from "@/domain/heart-rate";
import { addDays } from "@/domain/program-calendar";
import { ageOn } from "@/lib/units";
import type { Profile } from "@/server/queries/profile";

/**
 * Heart-rate zones as stored on the profile, and the runs that inform them (ADR 0059).
 *
 * A run's highest reading is the best field evidence of a maximum there is, so the year of runs
 * behind the athlete stands in for a stored maximum until one is entered or recorded, and a run
 * saved with a higher reading raises it. A year, because a maximum falls with age by about a
 * beat a year and a reading from long ago says less about today.
 */

/** How far back a run's reading still says something about today's maximum. */
export const OBSERVED_MAX_WINDOW_DAYS = 365;

export function heartRateSettingsOf(
  profile: Pick<
    Profile,
    | "maxHeartRate"
    | "maxHeartRateSource"
    | "maxHeartRateOn"
    | "maxHeartRateAuto"
    | "restingHeartRate"
    | "heartRateZoneMethod"
    | "heartRateZoneFloors"
  >,
): HeartRateSettings {
  return {
    maxHeartRate: profile.maxHeartRate,
    maxHeartRateSource: profile.maxHeartRateSource,
    maxHeartRateOn: profile.maxHeartRateOn,
    maxHeartRateAuto: profile.maxHeartRateAuto,
    restingHeartRate: profile.restingHeartRate,
    zoneMethod: profile.heartRateZoneMethod,
    customZoneFloors: profile.heartRateZoneFloors,
  };
}

/** A run's highest reading, its laps' included, as SQL: what `runPeakHeartRate` reads in code. */
const peak = sql<number | null>`greatest(
  ${runningActivityDetails.maxHeartRate},
  (select max((lap->>'maxHeartRate')::int) from jsonb_array_elements(${runningActivityDetails.laps}) as lap)
)`;

/** The highest reading a heart can reach among the year's runs before `today`, or null. */
export async function highestRecentRunHeartRate(
  db: DbOrTx,
  userId: string,
  today: string,
): Promise<ObservedMax | null> {
  const [row] = await db
    .select({ activityId: activities.id, on: activities.occurredOn, bpm: peak })
    .from(activities)
    .innerJoin(runningActivityDetails, eq(runningActivityDetails.activityId, activities.id))
    .where(
      and(
        eq(activities.userId, userId),
        eq(activities.sport, "running"),
        gte(activities.occurredOn, addDays(today, -OBSERVED_MAX_WINDOW_DAYS)),
        sql`${peak} <= ${PLAUSIBLE_MAX_HEART_RATE}`,
      ),
    )
    .orderBy(desc(peak), desc(activities.occurredOn))
    .limit(1);
  return row && row.bpm !== null ? { bpm: row.bpm, on: row.on, activityId: row.activityId } : null;
}

/** The maximum and zones in use for this athlete today, or null with nothing to read them from. */
export async function readHeartRate(
  db: DbOrTx,
  profile: Profile,
  today: string,
): Promise<{
  settings: HeartRateSettings;
  resolved: ResolvedHeartRate | null;
  highest: ObservedMax | null;
  age: number | null;
}> {
  const settings = heartRateSettingsOf(profile);
  const age = profile.dateOfBirth === null ? null : ageOn(profile.dateOfBirth, today);
  const highest = await highestRecentRunHeartRate(db, profile.id, today);
  return { settings, resolved: resolveHeartRate(settings, age, highest), highest, age };
}

/**
 * Raises the stored maximum when a run just saved recorded more than the maximum in use before
 * it (`before`), and returns the new maximum, or null when nothing changed. Guarded in the
 * update itself, so two runs saved at once cannot lower what either wrote.
 */
export async function raiseMaxHeartRateFromRun(
  db: DbOrTx,
  userId: string,
  before: { settings: HeartRateSettings; resolved: ResolvedHeartRate | null },
  actual: RunningActualV1,
  occurredOn: string,
): Promise<number | null> {
  const next = raisedMaxHeartRate(
    before.settings,
    before.resolved?.max ?? null,
    runPeakHeartRate(actual),
  );
  if (next === null) return null;
  const [row] = await db
    .update(profiles)
    .set({
      maxHeartRate: next,
      maxHeartRateSource: "observed",
      maxHeartRateOn: occurredOn,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(profiles.id, userId),
        eq(profiles.maxHeartRateAuto, true),
        or(isNull(profiles.maxHeartRate), lt(profiles.maxHeartRate, next)),
      ),
    )
    .returning({ maxHeartRate: profiles.maxHeartRate });
  return row?.maxHeartRate ?? null;
}
