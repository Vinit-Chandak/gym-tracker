import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { ownerPolicy, timestamps } from "./common";
import { runModeEnum } from "./enums";
import { gyms } from "./gyms";
import { profiles } from "./profiles";
import { programRuns } from "./programs";
import { workoutSessions } from "./workouts";

export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    workoutSessionId: uuid("workout_session_id").references(() => workoutSessions.id, {
      onDelete: "set null",
    }),
    gymId: uuid("gym_id").references(() => gyms.id, { onDelete: "set null" }),
    programRunId: uuid("program_run_id").references(() => programRuns.id, {
      onDelete: "set null",
    }),
    mode: runModeEnum("mode").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    distanceMeters: numeric("distance_meters", {
      precision: 8,
      scale: 1,
      mode: "number",
    }).notNull(),
    /** Derived by Postgres so it can never drift from the raw values. */
    averagePaceSecondsPerKm: numeric("average_pace_seconds_per_km", {
      precision: 7,
      scale: 1,
      mode: "number",
    }).generatedAlwaysAs(
      sql`case when distance_meters > 0 then round(duration_seconds * 1000.0 / distance_meters, 1) end`,
    ),
    rpe: numeric("rpe", { precision: 3, scale: 1, mode: "number" }),
    shinLeftPre: integer("shin_left_pre"),
    shinRightPre: integer("shin_right_pre"),
    shinLeftDuring: integer("shin_left_during"),
    shinRightDuring: integer("shin_right_during"),
    shinLeftPost: integer("shin_left_post"),
    shinRightPost: integer("shin_right_post"),
    surface: text("surface"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("runs_user_started_idx").on(t.userId, t.startedAt.desc()),
    check("runs_values_chk", sql`duration_seconds > 0 and distance_meters >= 0`),
    ownerPolicy("runs"),
  ],
).enableRLS();

/** Recovery log for days without a session (sessions carry their own check-in). */
export const dailyRecovery = pgTable(
  "daily_recovery",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    sleepHours: numeric("sleep_hours", { precision: 4, scale: 2, mode: "number" }),
    sleepQuality: integer("sleep_quality"),
    energy: integer("energy"),
    fatigue: integer("fatigue"),
    soreness: integer("soreness"),
    backPain: integer("back_pain"),
    shinLeft: integer("shin_left"),
    shinRight: integer("shin_right"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("daily_recovery_user_date_uq").on(t.userId, t.date),
    check(
      "daily_recovery_scales_chk",
      sql`(sleep_quality is null or sleep_quality between 1 and 5)
        and (energy is null or energy between 1 and 5)
        and (fatigue is null or fatigue between 1 and 5)
        and (soreness is null or soreness between 1 and 5)
        and (back_pain is null or back_pain between 0 and 10)
        and (shin_left is null or shin_left between 0 and 10)
        and (shin_right is null or shin_right between 0 and 10)`,
    ),
    ownerPolicy("daily_recovery"),
  ],
).enableRLS();
