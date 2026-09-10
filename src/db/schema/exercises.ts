import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
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
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("exercises_user_idx").on(t.userId), ...sharedOrOwnerPolicies("exercises")],
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
