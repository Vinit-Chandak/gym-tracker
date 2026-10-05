import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { ownerPolicy, readAllPolicy, timestamps } from "./common";
import { equipmentCategoryEnum, gymKindEnum, loadUnitEnum, resistanceModeEnum } from "./enums";
import { profiles } from "./profiles";

/** A physical location. `kind` distinguishes real gyms from virtual Outdoor/Home locations. */
export const gyms = pgTable(
  "gyms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    kind: gymKindEnum("kind").notNull().default("gym"),
    address: text("address"),
    notes: text("notes"),
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("gyms_user_slug_uq").on(t.userId, t.slug),
    uniqueIndex("gyms_one_default_per_user_uq")
      .on(t.userId)
      .where(sql`is_default = true`),
    index("gyms_user_idx").on(t.userId),
    ownerPolicy("gyms"),
  ],
).enableRLS();

/** Canonical equipment categories shared by every user (barbell, pec deck, 45° leg press, …). */
export const equipmentTypes = pgTable(
  "equipment_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    category: equipmentCategoryEnum("category").notNull(),
    defaultResistanceMode: resistanceModeEnum("default_resistance_mode").notNull(),
    defaultUnit: loadUnitEnum("default_unit").notNull().default("kg"),
    sortOrder: integer("sort_order").notNull().default(0),
    /** Other names people use for it, local ones included. Search reads them; nothing shows them. */
    aliases: text("aliases")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** What it is for, in a few plain words, under its name on a tile. */
    purpose: text("purpose"),
    /** What to look for to recognise it: the picture's distinguishing features, in words. */
    identification: text("identification"),
    /**
     * Types that are variants of one kind of machine (`leg_press`: 45°, horizontal, vertical)
     * share a family, so a beginner can say which one their gym has, or "a different one".
     */
    family: text("family"),
    /** The line drawing that shows it, by key; null where none is drawn yet. */
    illustration: text("illustration"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [readAllPolicy("equipment_types")],
).enableRLS();

/**
 * Equipment a kind of location is taken to have until someone says otherwise: the gym basics
 * (owner decision, 4 October 2026). Nothing is assumed at home or outdoors. Shared reference
 * data, rebuilt by the seed; an explicit absence at a gym always overrides it.
 */
export const assumedEquipmentTypes = pgTable(
  "assumed_equipment_types",
  {
    gymKind: gymKindEnum("gym_kind").notNull(),
    equipmentTypeId: uuid("equipment_type_id")
      .notNull()
      .references(() => equipmentTypes.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.gymKind, t.equipmentTypeId] }),
    readAllPolicy("assumed_equipment_types"),
  ],
).enableRLS();

/**
 * A machine sold as one piece that does the work of several types: a lat pulldown with a low
 * row, an assisted dip and chin. Choosing one registers a single machine carrying every type.
 */
export const equipmentCombinations = pgTable(
  "equipment_combinations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    aliases: text("aliases")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    purpose: text("purpose"),
    identification: text("identification"),
    illustration: text("illustration"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [readAllPolicy("equipment_combinations")],
).enableRLS();

/** The types one combination machine carries, the first being the machine's display type. */
export const equipmentCombinationTypes = pgTable(
  "equipment_combination_types",
  {
    combinationId: uuid("combination_id")
      .notNull()
      .references(() => equipmentCombinations.id, { onDelete: "cascade" }),
    equipmentTypeId: uuid("equipment_type_id")
      .notNull()
      .references(() => equipmentTypes.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.combinationId, t.equipmentTypeId] }),
    readAllPolicy("equipment_combination_types"),
  ],
).enableRLS();

/**
 * What the machines step suggests, per kind of location and answer to "Which sounds like
 * you?". Items are slugs of a type, a family or a combination, in the order shown; the step
 * resolves them against the catalogue. Versioned so a change of list is visible in data.
 */
export type EquipmentPresetItem = { type: string } | { family: string } | { combination: string };

export const equipmentPresets = pgTable(
  "equipment_presets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    gymKind: gymKindEnum("gym_kind").notNull(),
    /** `new`, `experienced`, or `any` for both. */
    experience: text("experience").notNull(),
    version: integer("version").notNull().default(1),
    items: jsonb("items")
      .$type<EquipmentPresetItem[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    check("equipment_presets_experience_chk", sql`experience in ('new', 'experienced', 'any')`),
    readAllPolicy("equipment_presets"),
  ],
).enableRLS();

/**
 * The exact machine or implement at one gym. Machine history is keyed on this row, never on
 * the equipment type, because stack numbers are not comparable between machines.
 */
export const equipmentInstances = pgTable(
  "equipment_instances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    equipmentTypeId: uuid("equipment_type_id")
      .notNull()
      .references(() => equipmentTypes.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    manufacturer: text("manufacturer"),
    model: text("model"),
    resistanceMode: resistanceModeEnum("resistance_mode").notNull(),
    unit: loadUnitEnum("unit").notNull().default("kg"),
    /** Smallest load jump on this machine, in `unit`. Null = not known yet. */
    loadIncrement: numeric("load_increment", { precision: 6, scale: 2, mode: "number" }),
    /** Actual selectable loads, in unit; an empty list means unconfirmed. */
    availableLoads: jsonb("available_loads")
      .$type<number[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    loadConvention: text("load_convention")
      .$type<"total" | "per_hand" | "assistance" | "stack_label" | "unknown">()
      .notNull()
      .default("unknown"),
    pulleyRatio: text("pulley_ratio"),
    angleDegrees: numeric("angle_degrees", { precision: 5, scale: 2, mode: "number" }),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("equipment_instances_gym_name_uq").on(t.gymId, t.name),
    index("equipment_instances_user_gym_idx").on(t.userId, t.gymId),
    // What a machine's own rows point at, owner included (`equipment_instance_types`).
    uniqueIndex("equipment_instances_user_id_uq").on(t.userId, t.id),
    ownerPolicy("equipment_instances"),
  ],
).enableRLS();

/**
 * Every type a machine is, so one combination machine can be a lat pulldown and a low row.
 * Each machine has at least its display type (`equipment_instances.equipment_type_id`), which a
 * database trigger keeps here; "Also used for" adds or removes the others. History stays keyed
 * on the machine, never on a type, so adding a type never mixes two exercises' records.
 */
export const equipmentInstanceTypes = pgTable(
  "equipment_instance_types",
  {
    equipmentInstanceId: uuid("equipment_instance_id")
      .notNull()
      .references(() => equipmentInstances.id, { onDelete: "cascade" }),
    equipmentTypeId: uuid("equipment_type_id")
      .notNull()
      .references(() => equipmentTypes.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.equipmentInstanceId, t.equipmentTypeId] }),
    index("equipment_instance_types_user_idx").on(t.userId),
    // A machine's types belong to the machine's owner: nobody can hold a type row on someone
    // else's machine, which would take the key that machine's own row needs.
    foreignKey({
      name: "equipment_instance_types_owner_fk",
      columns: [t.userId, t.equipmentInstanceId],
      foreignColumns: [equipmentInstances.userId, equipmentInstances.id],
    }).onDelete("cascade"),
    ownerPolicy("equipment_instance_types"),
  ],
).enableRLS();

/**
 * Equipment types the user knows a gym does not have. Without such a row a missing machine
 * is merely "unknown"; with it the planner can call an exercise unavailable at that gym.
 */
export const gymAbsentEquipmentTypes = pgTable(
  "gym_absent_equipment_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    equipmentTypeId: uuid("equipment_type_id")
      .notNull()
      .references(() => equipmentTypes.id, { onDelete: "restrict" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("gym_absent_equipment_types_gym_type_uq").on(t.gymId, t.equipmentTypeId),
    ownerPolicy("gym_absent_equipment_types"),
  ],
).enableRLS();
