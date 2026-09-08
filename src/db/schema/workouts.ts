import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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
import { loadUnitEnum, setTypeEnum } from "./enums";
import { exercises } from "./exercises";
import { equipmentInstances, gyms } from "./gyms";
import { profiles } from "./profiles";
import { programDays, programExercises, programs } from "./programs";

/** One training session at exactly one gym, with the optional pre-session recovery check-in. */
export const workoutSessions = pgTable(
  "workout_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    programId: uuid("program_id").references(() => programs.id, { onDelete: "set null" }),
    programDayId: uuid("program_day_id").references(() => programDays.id, {
      onDelete: "set null",
    }),
    /** The gym is part of the history; gyms are archived, never deleted, once used. */
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "restrict" }),
    /** Programme cycle this planned session belongs to; null for ad hoc sessions. */
    cycleIndex: integer("cycle_index"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    bodyWeightKg: numeric("body_weight_kg", { precision: 5, scale: 2, mode: "number" }),
    sleepHours: numeric("sleep_hours", { precision: 4, scale: 2, mode: "number" }),
    sleepQuality: integer("sleep_quality"),
    energy: integer("energy"),
    fatigue: integer("fatigue"),
    soreness: integer("soreness"),
    backPainPre: integer("back_pain_pre"),
    shinLeftPre: integer("shin_left_pre"),
    shinRightPre: integer("shin_right_pre"),
    /** The single warm-up entry per session: done or not. */
    warmupCompleted: boolean("warmup_completed").notNull().default(false),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("workout_sessions_user_started_idx").on(t.userId, t.startedAt.desc()),
    check(
      "workout_sessions_scales_chk",
      sql`(sleep_quality is null or sleep_quality between 1 and 5)
        and (energy is null or energy between 1 and 5)
        and (fatigue is null or fatigue between 1 and 5)
        and (soreness is null or soreness between 1 and 5)
        and (back_pain_pre is null or back_pain_pre between 0 and 10)
        and (shin_left_pre is null or shin_left_pre between 0 and 10)
        and (shin_right_pre is null or shin_right_pre between 0 and 10)`,
    ),
    ownerPolicy("workout_sessions"),
  ],
).enableRLS();

/** An exercise performed in a session, pinned to the exact machine when one was used. */
export const workoutExercises = pgTable(
  "workout_exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    workoutSessionId: uuid("workout_session_id")
      .notNull()
      .references(() => workoutSessions.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    equipmentInstanceId: uuid("equipment_instance_id").references(() => equipmentInstances.id, {
      onDelete: "restrict",
    }),
    plannedProgramExerciseId: uuid("planned_program_exercise_id").references(
      () => programExercises.id,
      { onDelete: "set null" },
    ),
    orderIndex: integer("order_index").notNull(),
    substitutionReason: text("substitution_reason"),
    notes: text("notes"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Set when the user chose not to do this exercise in the session. */
    skippedAt: timestamp("skipped_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("workout_exercises_session_order_uq").on(t.workoutSessionId, t.orderIndex),
    index("workout_exercises_history_idx").on(t.userId, t.exerciseId, t.equipmentInstanceId),
    ownerPolicy("workout_exercises"),
  ],
).enableRLS();

/** Raw set data. Load, unit, reps and RIR are stored exactly as logged. */
export const setLogs = pgTable(
  "set_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    workoutExerciseId: uuid("workout_exercise_id")
      .notNull()
      .references(() => workoutExercises.id, { onDelete: "cascade" }),
    setIndex: integer("set_index").notNull(),
    setType: setTypeEnum("set_type").notNull().default("working"),
    /** External load. Bodyweight movements log the added load; 0 means bodyweight only. */
    weight: numeric("weight", { precision: 7, scale: 2, mode: "number" }),
    unit: loadUnitEnum("unit").notNull().default("kg"),
    reps: integer("reps"),
    rir: numeric("rir", { precision: 3, scale: 1, mode: "number" }),
    rpe: numeric("rpe", { precision: 3, scale: 1, mode: "number" }),
    durationSeconds: integer("duration_seconds"),
    distanceMeters: numeric("distance_meters", { precision: 8, scale: 1, mode: "number" }),
    techniqueRating: integer("technique_rating"),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("set_logs_exercise_set_uq").on(t.workoutExerciseId, t.setIndex),
    check(
      "set_logs_values_chk",
      sql`(reps is null or reps >= 0)
        and (rir is null or rir >= 0)
        and (technique_rating is null or technique_rating between 1 and 5)`,
    ),
    ownerPolicy("set_logs"),
  ],
).enableRLS();
