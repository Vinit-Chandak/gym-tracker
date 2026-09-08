import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [readAllPolicy("equipment_types")],
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
    pulleyRatio: text("pulley_ratio"),
    angleDegrees: numeric("angle_degrees", { precision: 5, scale: 2, mode: "number" }),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("equipment_instances_gym_name_uq").on(t.gymId, t.name),
    index("equipment_instances_user_gym_idx").on(t.userId, t.gymId),
    ownerPolicy("equipment_instances"),
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
