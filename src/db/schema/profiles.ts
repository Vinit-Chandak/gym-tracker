import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  numeric,
  pgTable,
  pgView,
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
    /**
     * The public handle (ADR 0026): lowercase, 3–20 characters, unique. Set at sign-up by the
     * auth trigger — from what the form asked for, or generated from the email — and editable
     * from the profile. Rules are `domain/username.ts`; the check below and `generate_username()`
     * in the migration are the same rules in SQL.
     */
    username: text("username").notNull(),
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
    /**
     * Privacy (ADR 0026). Owner-only like every other column here; the follow trigger and the
     * `can_view_*` helpers read them as the migration role. Whether a follow needs approval.
     */
    followApproval: boolean("follow_approval").notNull().default(true),
    /** Off means followers see the profile card only: no stats, not on their leaderboards. */
    shareTraining: boolean("share_training").notNull().default(true),
    /** Opt-in: "per kg of body weight" rows and rankings, only with followers who also opt in. */
    shareBodyWeight: boolean("share_body_weight").notNull().default(false),
    /** Whether the exact-email lookup on the Friends page may return this account. */
    discoverableByEmail: boolean("discoverable_by_email").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    // The bounds the forms already enforced, written down where the data lives.
    check(
      "profiles_measurements_chk",
      sql`(body_weight_kg is null or (body_weight_kg > 0 and body_weight_kg <= 500))
        and (height_cm is null or (height_cm >= 50 and height_cm <= 260))`,
    ),
    // Stored lowercase, so the plain unique index is the case-insensitive one.
    uniqueIndex("profiles_username_uq").on(t.username),
    // The same rules as `USERNAME_PATTERN` and `RESERVED_USERNAMES`; `username_reserved()` is
    // defined in the migration so the list is written once in SQL.
    check(
      "profiles_username_chk",
      sql`username ~ '^[a-z0-9][a-z0-9._]{1,18}[a-z0-9]$'
        and username not like '%..%' and not public.username_reserved(username)`,
    ),
    ownerPolicy("profiles", "id"),
  ],
).enableRLS();

/**
 * The only facts about an account that any other account may read (ADR 0026): how search,
 * profile headers and leaderboard names find people. Owned by the migration role, so it reads
 * `profiles` without RLS; `security_barrier` keeps a caller's predicates from being pushed
 * inside it. No email, no measurements, and of the privacy switches only `follow_approval`,
 * which the follow button needs to say Follow or Request. Follower counts join it with the
 * `follows` table in the next migration.
 */
export const profileDirectory = pgView("profile_directory", {
  id: uuid("id").notNull(),
  username: text("username").notNull(),
  displayName: text("display_name"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull(),
  followApproval: boolean("follow_approval").notNull(),
})
  .with({ securityBarrier: true })
  .as(
    sql`select id, username, display_name, created_at as joined_at, follow_approval from public.profiles`,
  );

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
