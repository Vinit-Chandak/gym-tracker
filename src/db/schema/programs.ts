import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import type { ProgressionRule } from "../../domain/types";
import { ownerPolicy, timestamps } from "./common";
import {
  prescriptionTypeEnum,
  programStatusEnum,
  proposalSourceEnum,
  proposalStatusEnum,
  slotEventStatusEnum,
  slotPartEnum,
} from "./enums";
import { exercises, warmupProtocols } from "./exercises";
import { equipmentInstances, equipmentTypes, gyms } from "./gyms";
import { profiles } from "./profiles";

/**
 * A programme version. Versions are immutable once active: edits create a new row in the
 * same `family_id` with `version + 1`, so history keeps pointing at what was prescribed.
 */
export const programs = pgTable(
  "programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    familyId: uuid("family_id").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    version: integer("version").notNull().default(1),
    status: programStatusEnum("status").notNull().default("draft"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    weeks: integer("weeks"),
    /** Day slot the programme began on (1 = first day of the cycle). Earlier slots of cycle 1 never existed. */
    startDayIndex: integer("start_day_index").notNull().default(1),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("programs_user_slug_version_uq").on(t.userId, t.slug, t.version),
    uniqueIndex("programs_one_active_per_user_uq")
      .on(t.userId)
      .where(sql`status = 'active'`),
    index("programs_user_status_idx").on(t.userId, t.status),
    ownerPolicy("programs"),
  ],
).enableRLS();

export const programDays = pgTable(
  "program_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    dayIndex: integer("day_index").notNull(),
    name: text("name").notNull(),
    focus: text("focus"),
    /** ISO weekday 1 = Monday … 7 = Sunday used to suggest today's session. */
    dayOfWeek: integer("day_of_week"),
    includesLifting: boolean("includes_lifting").notNull().default(true),
    includesRun: boolean("includes_run").notNull().default(false),
    timeNote: text("time_note"),
    effortNote: text("effort_note"),
    notes: text("notes"),
    warmupProtocolId: uuid("warmup_protocol_id").references(() => warmupProtocols.id, {
      onDelete: "set null",
    }),
    recommendedGymId: uuid("recommended_gym_id").references(() => gyms.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("program_days_program_day_uq").on(t.programId, t.dayIndex),
    check("program_days_day_of_week_chk", sql`day_of_week is null or day_of_week between 1 and 7`),
    ownerPolicy("program_days"),
  ],
).enableRLS();

export const programExercises = pgTable(
  "program_exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    programDayId: uuid("program_day_id")
      .notNull()
      .references(() => programDays.id, { onDelete: "cascade" }),
    /**
     * The slot's identity across programme versions. A new version of a programme clones its
     * slots, giving each a new row; the lineage is what says "this is still the squat slot of
     * Lower A", so comparable history and the coach's own decisions survive a revision.
     */
    lineageId: uuid("lineage_id").notNull().defaultRandom(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    orderIndex: integer("order_index").notNull(),
    sets: integer("sets").notNull(),
    prescriptionType: prescriptionTypeEnum("prescription_type").notNull().default("reps"),
    repMin: integer("rep_min"),
    repMax: integer("rep_max"),
    durationMinSeconds: integer("duration_min_seconds"),
    durationMaxSeconds: integer("duration_max_seconds"),
    /** Carries, sled work and other distance-measured slots. Metres, always. */
    distanceMinMeters: integer("distance_min_meters"),
    distanceMaxMeters: integer("distance_max_meters"),
    perSide: boolean("per_side").notNull().default(false),
    rirMin: numeric("rir_min", { precision: 3, scale: 1, mode: "number" }),
    rirMax: numeric("rir_max", { precision: 3, scale: 1, mode: "number" }),
    restMinSeconds: integer("rest_min_seconds"),
    restMaxSeconds: integer("rest_max_seconds"),
    targetLoadNote: text("target_load_note"),
    progressionNotes: text("progression_notes"),
    progressionRule: jsonb("progression_rule").$type<ProgressionRule>(),
    keyCue: text("key_cue"),
    /** Exercises sharing a group are performed back to back. */
    supersetGroup: text("superset_group"),
    preferredEquipmentTypeId: uuid("preferred_equipment_type_id").references(
      () => equipmentTypes.id,
      { onDelete: "restrict" },
    ),
    preferredEquipmentInstanceId: uuid("preferred_equipment_instance_id").references(
      (): AnyPgColumn => equipmentInstances.id,
      { onDelete: "set null" },
    ),
    loadIncrement: numeric("load_increment", { precision: 6, scale: 2, mode: "number" }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("program_exercises_day_order_uq").on(t.programDayId, t.orderIndex),
    index("program_exercises_lineage_idx").on(t.lineageId),
    index("program_exercises_exercise_idx").on(t.exerciseId),
    check("program_exercises_sets_chk", sql`sets > 0`),
    check(
      "program_exercises_reps_chk",
      sql`rep_min is null or rep_max is null or rep_min <= rep_max`,
    ),
    check(
      "program_exercises_distance_chk",
      sql`(distance_min_meters is null or distance_min_meters >= 0)
        and (distance_max_meters is null or distance_max_meters >= 0)
        and (distance_min_meters is null or distance_max_meters is null
          or distance_min_meters <= distance_max_meters)`,
    ),
    ownerPolicy("program_exercises"),
  ],
).enableRLS();

/** Alternatives when the planned exercise/equipment is not available at a gym. */
export const programExerciseFallbacks = pgTable(
  "program_exercise_fallbacks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    programExerciseId: uuid("program_exercise_id")
      .notNull()
      .references(() => programExercises.id, { onDelete: "cascade" }),
    /** Null = applies at every gym. */
    gymId: uuid("gym_id").references(() => gyms.id, { onDelete: "cascade" }),
    fallbackExerciseId: uuid("fallback_exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    fallbackEquipmentTypeId: uuid("fallback_equipment_type_id").references(
      () => equipmentTypes.id,
      { onDelete: "restrict" },
    ),
    fallbackEquipmentInstanceId: uuid("fallback_equipment_instance_id").references(
      () => equipmentInstances.id,
      { onDelete: "set null" },
    ),
    rank: integer("rank").notNull().default(1),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("program_exercise_fallbacks_pe_idx").on(t.programExerciseId),
    ownerPolicy("program_exercise_fallbacks"),
  ],
).enableRLS();

/** Planned easy runs per programme week (the RUNNING sheet). */
export const programRuns = pgTable(
  "program_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    weekIndex: integer("week_index").notNull(),
    dayOfWeek: integer("day_of_week").notNull(),
    durationMinMinutes: integer("duration_min_minutes").notNull(),
    durationMaxMinutes: integer("duration_max_minutes").notNull(),
    rpeMin: numeric("rpe_min", { precision: 3, scale: 1, mode: "number" }),
    rpeMax: numeric("rpe_max", { precision: 3, scale: 1, mode: "number" }),
    paceNote: text("pace_note"),
    progressionNote: text("progression_note"),
    shinRule: text("shin_rule"),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("program_runs_program_week_day_uq").on(t.programId, t.weekIndex, t.dayOfWeek),
    ownerPolicy("program_runs"),
  ],
).enableRLS();

/** Proposed changes (manual, rule engine or AI) that become a new programme version when applied. */
export const programChangeProposals = pgTable(
  "program_change_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    source: proposalSourceEnum("source").notNull(),
    status: proposalStatusEnum("status").notNull().default("proposed"),
    summary: text("summary").notNull(),
    rationale: text("rationale"),
    patch: jsonb("patch")
      .notNull()
      .default(sql`'{}'::jsonb`),
    appliedProgramId: uuid("applied_program_id").references((): AnyPgColumn => programs.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
  },
  (t) => [
    index("program_change_proposals_program_idx").on(t.programId),
    ownerPolicy("program_change_proposals"),
  ],
).enableRLS();

/**
 * What happened to each *part* of each slot of the programme sequence (cycle × day × part):
 * completed by a session or a logged run, or skipped on purpose.
 *
 * A day can ask for two independent things — lift, run — and one row records one of them, so
 * finishing the workout on a day that also runs no longer answers for the run. The next thing
 * to do is the earliest slot with a part that has no event; a day is behind the sequence until
 * every part it asks for has one. Rest days ask only for `session`, which is what "mark rest
 * day done" writes.
 */
export const programSlotEvents = pgTable(
  "program_slot_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    cycleIndex: integer("cycle_index").notNull(),
    dayIndex: integer("day_index").notNull(),
    /** Which half of the day this is about. Everything written before runs were separate is `session`. */
    part: slotPartEnum("part").notNull().default("session"),
    status: slotEventStatusEnum("status").notNull(),
    /** Set when the slot was completed by a logged session. */
    workoutSessionId: uuid("workout_session_id"),
    /** Set when the `run` part was completed by a logged run. */
    runId: uuid("run_id"),
    occurredOn: date("occurred_on").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("program_slot_events_slot_uq").on(t.programId, t.cycleIndex, t.dayIndex, t.part),
    check("program_slot_events_indexes_chk", sql`cycle_index >= 1 and day_index >= 1`),
    ownerPolicy("program_slot_events"),
  ],
).enableRLS();
