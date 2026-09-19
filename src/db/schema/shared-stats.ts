import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

import type { MuscleSets } from "../../domain/muscle-split";
import type { TrainingRecord } from "../../domain/records";
import { timestamps } from "./common";
import { trainingSportEnum } from "./enums";
import { exercises } from "./exercises";
import { profiles } from "./profiles";

/** `(select auth.uid())` — the subselect lets Postgres cache it per statement. */
const AUTH_UID = sql.raw("(select auth.uid())");

/**
 * The shared tables (ADR 0026): the only rows another account can ever read. The `shared_`
 * prefix is deliberate — anyone reading the schema sees at once what leaves an account.
 * Written by the owner from `finishSession`, the run writes and `recordBodyWeight`; read by
 * an accepted follower while the owner shares, which `can_view_training()` (migration 0020)
 * and `can_view_body_weight()` (0021) decide as security-definer functions. Every query in
 * application code names the user ids it wants; RLS is the guarantee, not the filter.
 */
function sharedPolicies(table: string, canView: string) {
  const owner = sql`user_id = ${AUTH_UID}`;
  return [
    pgPolicy(`${table}_select`, {
      for: "select",
      to: authenticatedRole,
      using: sql`${sql.raw(canView)}(user_id)`,
    }),
    pgPolicy(`${table}_insert`, { for: "insert", to: authenticatedRole, withCheck: owner }),
    pgPolicy(`${table}_update`, {
      for: "update",
      to: authenticatedRole,
      using: owner,
      withCheck: owner,
    }),
    pgPolicy(`${table}_delete`, { for: "delete", to: authenticatedRole, using: owner }),
  ];
}

/** One row per finished workout or logged run: what a follower sees of a session. */
export const sharedSessionStats = pgTable(
  "shared_session_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    sport: trainingSportEnum("sport").notNull(),
    /** `workout_sessions.id` or `runs.id`; no FK, since the sport decides which. */
    sourceId: uuid("source_id").notNull(),
    /**
     * The canonical activity this projects, once one exists.
     *
     * Nullable and unconstrained here on purpose. The same-owner foreign key belongs to M2,
     * after the backfill has been reconciled: a row whose source cannot be resolved is an
     * anomaly to be looked at, not a constraint violation to be worked around at cutover
     * (plan §§9.2, 10.1). `db:validate:multisport` adds it once the ledger is clean.
     */
    activityId: uuid("activity_id"),
    /** The programme day's name, or "Workout" / "Run". Never a note. */
    title: text("title").notNull(),
    /** The civil date of `started_at` in the owner's time zone. */
    occurredOn: date("occurred_on").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    /** Workouts: finish minus start, capped at four hours. Runs: as logged. */
    durationSeconds: integer("duration_seconds").notNull(),
    workingSets: integer("working_sets").notNull().default(0),
    /** Σ weight × reps over kg and lb working sets, in kilograms. */
    volumeKg: numeric("volume_kg", { precision: 10, scale: 2, mode: "number" })
      .notNull()
      .default(0),
    distanceMeters: numeric("distance_meters", { precision: 9, scale: 1, mode: "number" }),
    paceSecondsPerKm: numeric("pace_seconds_per_km", { precision: 7, scale: 1, mode: "number" }),
    /** Working sets per muscle, secondaries at half weight; muscles with none are absent. */
    muscleSets: jsonb("muscle_sets").$type<MuscleSets>().notNull().default({}),
    /** The records this session set, decided when it finished. */
    records: jsonb("records").$type<TrainingRecord[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("shared_session_stats_source_uq").on(t.userId, t.sport, t.sourceId),
    index("shared_session_stats_user_sport_day_idx").on(t.userId, t.sport, t.occurredOn.desc()),
    ...sharedPolicies("shared_session_stats", "public.can_view_training"),
  ],
).enableRLS();

/** One row per finished workout × shared-library exercise; what Compare and records read. */
export const sharedExerciseStats = pgTable(
  "shared_exercise_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    /** No FK across the privacy boundary; the owner cascade suffices. */
    workoutSessionId: uuid("workout_session_id").notNull(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    occurredOn: date("occurred_on").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    /** A library exercise whose load means the same everywhere (plan §3.9). */
    comparable: boolean("comparable").notNull(),
    workingSets: integer("working_sets").notNull(),
    totalReps: integer("total_reps"),
    /** kg and lb sets only, converted to kilograms; stack steps carry no weight. */
    topWeightKg: numeric("top_weight_kg", { precision: 7, scale: 2, mode: "number" }),
    /**
     * How the top weight was worked that session: the working sets at exactly that load and
     * the most reps any of them reached, so a board can read "7.5 kg · 4 × 12" rather than a
     * bare load. Null on rows written before these columns existed until the backfill
     * re-derives them.
     */
    topWeightSets: integer("top_weight_sets"),
    topWeightReps: integer("top_weight_reps"),
    bestE1rmKg: numeric("best_e1rm_kg", { precision: 7, scale: 2, mode: "number" }),
    /** The heaviest single set by weight × reps. */
    bestSetVolumeKg: numeric("best_set_volume_kg", { precision: 9, scale: 2, mode: "number" }),
    mostReps: integer("most_reps"),
    longestDurationSeconds: integer("longest_duration_seconds"),
    longestDistanceMeters: numeric("longest_distance_meters", {
      precision: 8,
      scale: 1,
      mode: "number",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("shared_exercise_stats_session_exercise_uq").on(
      t.userId,
      t.workoutSessionId,
      t.exerciseId,
    ),
    index("shared_exercise_stats_user_exercise_day_idx").on(
      t.userId,
      t.exerciseId,
      t.occurredOn.desc(),
    ),
    // The leaderboard's entry point: everyone's rows for one comparable movement.
    index("shared_exercise_stats_comparable_idx")
      .on(t.exerciseId, t.comparable)
      .where(sql`comparable`),
    ...sharedPolicies("shared_exercise_stats", "public.can_view_training"),
  ],
).enableRLS();

/** At most one row per person: the latest reading, for "per kg of body weight" (decision 5). */
export const sharedBodyWeight = pgTable(
  "shared_body_weight",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => profiles.id, { onDelete: "cascade" }),
    weightKg: numeric("weight_kg", { precision: 5, scale: 2, mode: "number" }).notNull(),
    measuredOn: date("measured_on").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  () => [...sharedPolicies("shared_body_weight", "public.can_view_body_weight")],
).enableRLS();
