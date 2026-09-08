import { boolean, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { ownerPolicy, timestamps } from "./common";
import { loadUnitEnum } from "./enums";

/**
 * One row per Supabase Auth user. `id` equals `auth.users.id`; the FK and the trigger that
 * creates the row on sign-up live in the hand-written migration (`*_auth_bridge.sql`).
 */
export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey(),
    email: text("email"),
    displayName: text("display_name"),
    timeZone: text("time_zone").notNull().default("Asia/Kolkata"),
    preferredUnit: loadUnitEnum("preferred_unit").notNull().default("kg"),
    bodyWeightKg: numeric("body_weight_kg", { precision: 5, scale: 2, mode: "number" }),
    /** Optional rest timer between sets; off unless the user switches it on. */
    restTimerEnabled: boolean("rest_timer_enabled").notNull().default(false),
    ...timestamps,
  },
  () => [ownerPolicy("profiles", "id")],
).enableRLS();
