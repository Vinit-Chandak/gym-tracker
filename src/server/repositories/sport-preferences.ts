import { and, asc, eq, inArray } from "drizzle-orm";

import { activities, profiles, userSportPreferences } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { ACTIVITY_SPORTS, type ActivitySport } from "@/domain/activity";
import { DEFAULT_SPORT_UNITS, resolveSportUnits, type SportUnits } from "@/lib/distance-units";

/**
 * Which sports an account trains and what it shares (SPORT-01), and the units it reads them in,
 * which are the profile's (ADR 0055).
 *
 * Turning a sport off is a shortcut preference and nothing more. History stays, templates
 * stay, and a programme that includes the sport keeps including it — removing it from a
 * programme is a separate, confirmed programme change, not a side effect of a switch.
 */

export type SportPreference = {
  sport: ActivitySport;
  enabled: boolean;
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
    .select({
      sport: userSportPreferences.sport,
      enabled: userSportPreferences.enabled,
      shareStats: userSportPreferences.shareStats,
    })
    .from(userSportPreferences)
    .where(eq(userSportPreferences.userId, userId))
    .orderBy(asc(userSportPreferences.sport));
  const bySport = new Map(rows.map((row) => [row.sport, row]));
  return ACTIVITY_SPORTS.map((sport) => {
    const row = bySport.get(sport);
    return {
      sport,
      enabled: row?.enabled ?? DEFAULTS[sport].enabled,
      // Sharing is never opened by a default: an account that has not chosen shares nothing new.
      shareStats: row?.shareStats ?? false,
    };
  });
}

/** The sports shared under a switch of their own; lifting and running are the training switch's. */
export const SEPARATELY_SHARED = ["cycling", "swimming"] as const;
export type SeparatelySharedSport = (typeof SEPARATELY_SHARED)[number];

/**
 * The ride and swim sharing switches Privacy offers, each with its setting: one for a sport you
 * do, one you still share, and one you have logged. Turning a sport off keeps its history
 * (above), so the history keeps its switch: rides logged before Cycling went off can still be
 * shared, or stop being. A sport off, unshared and never logged has nothing to share.
 */
export async function listSportSharingSwitches(
  tx: DbOrTx,
  userId: string,
): Promise<Partial<Record<SeparatelySharedSport, boolean>>> {
  const preferences = await listSportPreferences(tx, userId);
  const logged = await tx
    .selectDistinct({ sport: activities.sport })
    .from(activities)
    .where(
      and(
        eq(activities.userId, userId),
        inArray(activities.sport, [...SEPARATELY_SHARED]),
        eq(activities.status, "completed"),
      ),
    );
  const done = new Set(logged.map((row) => row.sport));
  return Object.fromEntries(
    preferences
      .filter(
        (preference): preference is SportPreference & { sport: SeparatelySharedSport } =>
          (SEPARATELY_SHARED as readonly string[]).includes(preference.sport) &&
          (preference.enabled || preference.shareStats || done.has(preference.sport)),
      )
      .map((preference) => [preference.sport, preference.shareStats]),
  );
}

/**
 * Whether the athlete has ever said which sports they train. Until they have, the defaults
 * above stand in for an older account; setup asks a new one with nothing ticked (audit B10).
 */
export async function hasChosenSports(tx: DbOrTx, userId: string): Promise<boolean> {
  const [row] = await tx
    .select({ sport: userSportPreferences.sport })
    .from(userSportPreferences)
    .where(eq(userSportPreferences.userId, userId))
    .limit(1);
  return row !== undefined;
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
      shareStats: changes.shareStats ?? false,
    })
    .onConflictDoUpdate({
      target: [userSportPreferences.userId, userSportPreferences.sport],
      set: { ...changes, updatedAt: new Date() },
    });
}

/**
 * How this athlete reads distances, every sport alike (ADR 0055): a road in kilometres or miles,
 * a pool in metres or yards, and a carry in metres or yards beside them. What the profile chose,
 * and where it chose nothing, what its weight unit gives. An account with no profile yet reads
 * the defaults.
 */
export async function readSportUnits(tx: DbOrTx, userId: string): Promise<SportUnits> {
  const [row] = await tx
    .select({
      preferredUnit: profiles.preferredUnit,
      distanceUnit: profiles.distanceUnit,
      poolUnit: profiles.poolUnit,
    })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return row ? resolveSportUnits(row.preferredUnit, row) : DEFAULT_SPORT_UNITS;
}

/** The same units keyed by sport, for a page that lists more than one sport's sessions. */
export async function unitsBySport(
  tx: DbOrTx,
  userId: string,
): Promise<Record<ActivitySport, SportUnits>> {
  const units = await readSportUnits(tx, userId);
  return Object.fromEntries(ACTIVITY_SPORTS.map((sport) => [sport, units])) as Record<
    ActivitySport,
    SportUnits
  >;
}
