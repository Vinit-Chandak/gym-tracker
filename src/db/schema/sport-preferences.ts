import { sql } from "drizzle-orm";
import { boolean, check, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";

import { serverWritePolicies, timestamps } from "./common";
import { activitySportEnum, lengthUnitEnum } from "./multisport-enums";
import { profiles } from "./profiles";

/**
 * Which sports this account trains and what it shares (SPORT-01, SOCIAL-02). How it measures
 * them is the profile's (ADR 0056).
 *
 * Turning a sport off is a shortcut preference, not a deletion: history, templates and
 * approved programme commitments all survive it, and removing a sport from a programme is a
 * separate, confirmed programme change.
 *
 * Sharing starts off for cycling and swimming. Strength and running keep whatever the account
 * already chose, under the existing global `share_training` switch, which stays the upper
 * bound: no migration opens a category that was private.
 */
export const userSportPreferences = pgTable(
  "user_sport_preferences",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    sport: activitySportEnum("sport").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    /**
     * @deprecated Retired by ADR 0056: an account reads every sport's distances in one pair of
     * units, `profiles.distance_unit` and `pool_unit`. Kept only because the build that moves
     * them runs while the previous deployment still reads these; a later migration drops them.
     * Nothing reads or writes them now.
     */
    distanceUnit: lengthUnitEnum("distance_unit").notNull().default("km"),
    /** @deprecated See `distanceUnit`. */
    poolUnit: lengthUnitEnum("pool_unit").notNull().default("m"),
    shareStats: boolean("share_stats").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.sport] }),
    check(
      "user_sport_preferences_units_chk",
      sql`distance_unit in ('km', 'mi') and pool_unit in ('m', 'yd')`,
    ),
    ...serverWritePolicies("user_sport_preferences"),
  ],
).enableRLS();
