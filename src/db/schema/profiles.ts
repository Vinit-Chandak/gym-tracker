import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { ownerPolicy, timestamps } from "./common";
import { loadUnitEnum, sexEnum, trainingGoalEnum } from "./enums";

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
    /** IANA zone; every civil date in the app is resolved in it. Set during onboarding. */
    timeZone: text("time_zone").notNull().default("UTC"),
    preferredUnit: loadUnitEnum("preferred_unit").notNull().default("kg"),
    /**
     * The most recent body weight reading, in kilograms. Kept in step with the newest row in
     * `body_weight_logs` rather than written on its own, so "what I weigh" and the trend behind
     * it can never disagree.
     */
    bodyWeightKg: numeric("body_weight_kg", { precision: 5, scale: 2, mode: "number" }),
    /** Standing height in centimetres; shown in feet and inches for accounts that use pounds. */
    heightCm: numeric("height_cm", { precision: 5, scale: 1, mode: "number" }),
    /** The date itself, not a moment: a birthday does not move with a time zone. */
    dateOfBirth: date("date_of_birth"),
    /** Null is an answer in its own right — "prefer not to say". */
    sex: sexEnum("sex"),
    trainingGoal: trainingGoalEnum("training_goal"),
    /** Optional rest timer between sets; off unless the user switches it on. */
    restTimerEnabled: boolean("rest_timer_enabled").notNull().default(false),
    /** Lets the house coach plan this account's sessions. Off unless the user switches it on. */
    aiCoachEnabled: boolean("ai_coach_enabled").notNull().default(false),
    /** Set when the first-run flow finished. Null sends the account to /welcome. */
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    ...timestamps,
  },
  () => [
    // The bounds the forms already enforced, written down where the data lives.
    check(
      "profiles_measurements_chk",
      sql`(body_weight_kg is null or (body_weight_kg > 0 and body_weight_kg <= 500))
        and (height_cm is null or (height_cm >= 50 and height_cm <= 260))`,
    ),
    ownerPolicy("profiles", "id"),
  ],
).enableRLS();

/**
 * Every body weight reading, at most one per day. Finishing a workout with a weight writes one,
 * and so does changing the weight on the profile: the trend on Progress is this table, and
 * `profiles.body_weight_kg` is whichever row is newest.
 */
export const bodyWeightLogs = pgTable(
  "body_weight_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    /** The civil date in the account's own time zone, so a late-evening session counts today. */
    measuredOn: date("measured_on").notNull(),
    weightKg: numeric("weight_kg", { precision: 5, scale: 2, mode: "number" }).notNull(),
    ...timestamps,
  },
  (t) => [
    // Weighing yourself twice in a day corrects the day; it does not add a second point.
    uniqueIndex("body_weight_logs_user_day_uq").on(t.userId, t.measuredOn),
    index("body_weight_logs_user_date_idx").on(t.userId, t.measuredOn.desc()),
    check("body_weight_logs_weight_chk", sql`weight_kg > 0 and weight_kg <= 500`),
    ownerPolicy("body_weight_logs"),
  ],
).enableRLS();
