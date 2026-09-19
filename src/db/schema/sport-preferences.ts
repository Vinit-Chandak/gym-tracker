import { sql } from "drizzle-orm";
import { boolean, check, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";

import { serverWritePolicies, timestamps } from "./common";
import { activitySportEnum, lengthUnitEnum } from "./multisport-enums";
import { profiles } from "./profiles";

/**
 * Which sports this account trains, how it measures them, and what it shares (SPORT-01, SOCIAL-02).
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
    /** Road distances in kilometres or miles; pools in metres or yards. */
    distanceUnit: lengthUnitEnum("distance_unit").notNull().default("km"),
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
