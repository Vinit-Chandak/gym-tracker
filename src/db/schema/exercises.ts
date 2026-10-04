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
} from "drizzle-orm/pg-core";

import type { MuscleGroup, WarmupDrill } from "../../domain/types";
import { readAllPolicy, sharedOrOwnerPolicies, timestamps } from "./common";
import {
  exerciseCategoryEnum,
  exerciseModalityEnum,
  loadPortabilityEnum,
  prescriptionTypeEnum,
} from "./enums";
import { equipmentInstances, equipmentTypes } from "./gyms";
import { profiles } from "./profiles";

/** Canonical movements. `user_id` is null for the shared library; users can add their own. */
export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    category: exerciseCategoryEnum("category").notNull(),
    modality: exerciseModalityEnum("modality").notNull(),
    movementPattern: text("movement_pattern").notNull(),
    primaryMuscles: text("primary_muscles")
      .array()
      .$type<MuscleGroup[]>()
      .notNull()
      .default(sql`'{}'::text[]`),
    secondaryMuscles: text("secondary_muscles")
      .array()
      .$type<MuscleGroup[]>()
      .notNull()
      .default(sql`'{}'::text[]`),
    loadPortability: loadPortabilityEnum("load_portability").notNull(),
    requiresEquipment: boolean("requires_equipment").notNull().default(true),
    /**
     * How the movement is measured when no programme slot says otherwise: reps, seconds held,
     * or metres covered. A slot may still override it, but this is what an exercise added to a
     * session on the spot is logged in.
     */
    defaultPrescriptionType: prescriptionTypeEnum("default_prescription_type")
      .notNull()
      .default("reps"),
    defaultRepMin: integer("default_rep_min"),
    defaultRepMax: integer("default_rep_max"),
    defaultDurationMinSeconds: integer("default_duration_min_seconds"),
    defaultDurationMaxSeconds: integer("default_duration_max_seconds"),
    defaultDistanceMinMeters: integer("default_distance_min_meters"),
    defaultDistanceMaxMeters: integer("default_distance_max_meters"),
    defaultRir: numeric("default_rir", { precision: 3, scale: 1, mode: "number" }),
    defaultRestSeconds: integer("default_rest_seconds"),
    /**
     * What reps in reserve means for this movement, in one sentence. Two RIR on a squat is a
     * different instruction from two RIR on a plank or a carry, so the note travels with the
     * exercise rather than being explained once, generically, next to the column.
     */
    rirNote: text("rir_note"),
    /** Smallest sensible load jump in kg when the equipment does not say otherwise. */
    defaultLoadIncrement: numeric("default_load_increment", {
      precision: 6,
      scale: 2,
      mode: "number",
    }),
    formNotes: text("form_notes"),
    formUrl: text("form_url"),
    /**
     * How a set of it is logged, when that needs saying: "Load is per dumbbell.", "Log added
     * load only." Technique shows it under How to log, guide or no guide.
     */
    logNote: text("log_note"),
    /** Other names people use for it ("RDL", "OHP"). Search reads them; nothing shows them. */
    aliases: text("aliases")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("exercises_user_idx").on(t.userId), ...sharedOrOwnerPolicies("exercises")],
).enableRLS();

/**
 * What an exercise needs, as ordered alternatives (plan: S3). Each alternative is a group of
 * types used together, numbered by `alternative`; exactly one type in a group is its primary,
 * the load-bearing equipment a workout records and keys history on. A Smith hip thrust is one
 * group (Smith machine, primary; flat bench); a dip is two (a dip station; gymnastic rings).
 *
 * Shared rows are rebuilt by the seed, so nothing may point at their ids. The flat
 * `exercise_equipment_options` stay beside them for the user's own instance-level choices (a
 * preferred machine, a custom exercise's machine) and as each alternative's primary type.
 */
export const exerciseEquipmentRequirements = pgTable(
  "exercise_equipment_requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    /** 1-based, in preference order. */
    alternative: integer("alternative").notNull(),
    equipmentTypeId: uuid("equipment_type_id")
      .notNull()
      .references(() => equipmentTypes.id, { onDelete: "restrict" }),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (t) => [
    uniqueIndex("exercise_equipment_requirements_uq").on(
      t.exerciseId,
      t.alternative,
      t.equipmentTypeId,
    ),
    uniqueIndex("exercise_equipment_requirements_primary_uq")
      .on(t.exerciseId, t.alternative)
      .where(sql`is_primary`),
    check("exercise_equipment_requirements_alternative_chk", sql`alternative >= 1`),
    ...sharedOrOwnerPolicies("exercise_equipment_requirements"),
  ],
).enableRLS();

/**
 * How to perform one exercise variant, written for Overload (plan: Technique and media). A
 * draft is shown only where drafts are switched on; the reviewer and date say who published it.
 * One row per exercise; `version` rises when reviewed text changes.
 */
export type GuideSourceRef = { title: string; publisher: string; url: string };

export const exerciseGuides = pgTable(
  "exercise_guides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .unique()
      .references(() => exercises.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("draft"),
    setup: text("setup").notNull(),
    steps: jsonb("steps").$type<string[]>().notNull(),
    cues: jsonb("cues").$type<string[]>().notNull(),
    mistakes: jsonb("mistakes").$type<string[]>().notNull(),
    sources: jsonb("sources").$type<GuideSourceRef[]>().notNull(),
    draftedBy: text("drafted_by"),
    reviewer: text("reviewer"),
    reviewedOn: date("reviewed_on"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    check("exercise_guides_status_chk", sql`status in ('draft', 'published')`),
    readAllPolicy("exercise_guides"),
  ],
).enableRLS();

/**
 * A demonstration of an exercise elsewhere: for now a YouTube video, opened on YouTube rather
 * than embedded. A candidate awaits the owner; only an approved one is offered in production.
 */
export const exerciseMedia = pgTable(
  "exercise_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    videoId: text("video_id").notNull(),
    startSeconds: integer("start_seconds"),
    title: text("title").notNull(),
    channel: text("channel").notNull(),
    url: text("url").notNull(),
    usageBasis: text("usage_basis").notNull(),
    checkedOn: date("checked_on").notNull(),
    status: text("status").notNull().default("candidate"),
    position: integer("position").notNull().default(1),
  },
  (t) => [
    uniqueIndex("exercise_media_exercise_video_uq").on(t.exerciseId, t.provider, t.videoId),
    check("exercise_media_provider_chk", sql`provider in ('youtube')`),
    check("exercise_media_status_chk", sql`status in ('candidate', 'approved')`),
    readAllPolicy("exercise_media"),
  ],
).enableRLS();

/**
 * Which equipment an exercise can be performed on. Type-level rows are shared reference data;
 * instance-level rows are a user's gym-specific mapping.
 */
export const exerciseEquipmentOptions = pgTable(
  "exercise_equipment_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    equipmentTypeId: uuid("equipment_type_id").references(() => equipmentTypes.id, {
      onDelete: "restrict",
    }),
    equipmentInstanceId: uuid("equipment_instance_id").references(() => equipmentInstances.id, {
      onDelete: "cascade",
    }),
    preferenceRank: integer("preference_rank").notNull().default(1),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "exercise_equipment_options_target_chk",
      sql`equipment_type_id is not null or equipment_instance_id is not null`,
    ),
    index("exercise_equipment_options_exercise_idx").on(t.exerciseId),
    ...sharedOrOwnerPolicies("exercise_equipment_options"),
  ],
).enableRLS();

/** Warm-up checklists (run / upper / lower / daily mobility). Shown, not logged per drill. */
export const warmupProtocols = pgTable(
  "warmup_protocols",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    drills: jsonb("drills")
      .$type<WarmupDrill[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [readAllPolicy("warmup_protocols")],
).enableRLS();
