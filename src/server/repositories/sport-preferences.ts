import { and, asc, eq } from "drizzle-orm";

import { userSportPreferences } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { ACTIVITY_SPORTS, type ActivitySport } from "@/domain/activity";
import type { DistanceUnit, PoolUnit } from "@/lib/distance-units";

/**
 * Which sports an account trains, how it measures them, and what it shares (SPORT-01).
 *
 * Turning a sport off is a shortcut preference and nothing more. History stays, templates
 * stay, and a programme that includes the sport keeps including it — removing it from a
 * programme is a separate, confirmed programme change, not a side effect of a switch.
 */

export type SportPreference = {
  sport: ActivitySport;
  enabled: boolean;
  distanceUnit: DistanceUnit;
  poolUnit: PoolUnit;
  shareStats: boolean;
};

/** Defaults for an account that has never been asked: what it already does, nothing new. */
const DEFAULTS: Record<ActivitySport, { enabled: boolean }> = {
  strength: { enabled: true },
  running: { enabled: true },
  cycling: { enabled: false },
  swimming: { enabled: false },
};

export async function listSportPreferences(tx: DbOrTx, userId: string): Promise<SportPreference[]> {
  const rows = await tx
    .select()
    .from(userSportPreferences)
    .where(eq(userSportPreferences.userId, userId))
    .orderBy(asc(userSportPreferences.sport));
  const bySport = new Map(rows.map((row) => [row.sport, row]));
  return ACTIVITY_SPORTS.map((sport) => {
    const row = bySport.get(sport);
    return {
      sport,
      enabled: row?.enabled ?? DEFAULTS[sport].enabled,
      distanceUnit: (row?.distanceUnit ?? "km") as DistanceUnit,
      poolUnit: (row?.poolUnit ?? "m") as PoolUnit,
      // Sharing is never opened by a default: an account that has not chosen shares nothing new.
      shareStats: row?.shareStats ?? false,
    };
  });
}

export async function enabledSportsFor(tx: DbOrTx, userId: string): Promise<ActivitySport[]> {
  const preferences = await listSportPreferences(tx, userId);
  return preferences
    .filter((preference) => preference.enabled)
    .map((preference) => preference.sport);
}

export async function setSportPreference(
  tx: DbOrTx,
  userId: string,
  sport: ActivitySport,
  changes: Partial<Omit<SportPreference, "sport">>,
): Promise<void> {
  await tx
    .insert(userSportPreferences)
    .values({
      userId,
      sport,
      enabled: changes.enabled ?? DEFAULTS[sport].enabled,
      distanceUnit: changes.distanceUnit ?? "km",
      poolUnit: changes.poolUnit ?? "m",
      shareStats: changes.shareStats ?? false,
    })
    .onConflictDoUpdate({
      target: [userSportPreferences.userId, userSportPreferences.sport],
      set: { ...changes, updatedAt: new Date() },
    });
}

/** The units a form should open in for this athlete and this sport. */
export async function unitsFor(
  tx: DbOrTx,
  userId: string,
  sport: ActivitySport,
): Promise<{ distanceUnit: DistanceUnit; poolUnit: PoolUnit }> {
  const [row] = await tx
    .select({
      distanceUnit: userSportPreferences.distanceUnit,
      poolUnit: userSportPreferences.poolUnit,
    })
    .from(userSportPreferences)
    .where(and(eq(userSportPreferences.userId, userId), eq(userSportPreferences.sport, sport)))
    .limit(1);
  return {
    distanceUnit: (row?.distanceUnit ?? "km") as DistanceUnit,
    poolUnit: (row?.poolUnit ?? "m") as PoolUnit,
  };
}
