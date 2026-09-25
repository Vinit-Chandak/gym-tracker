import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
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

import type { FoodItem, MacroSplit } from "../../domain/nutrition";
import { ownerPolicy, timestamps } from "./common";
import { profiles } from "./profiles";

/*
 * Food (ADR 0032). Built behind `FOOD_TRACKING_ENABLED`: the tables exist on every database the
 * migrations reach, and nothing reads or writes them until the switch is on for an account.
 * The bounds in the check constraints are `NUTRITION_LIMITS` in `domain/nutrition.ts`.
 */

const owner = () =>
  uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" });

/**
 * What an account's eating is measured against: one row, written from the Food screen's targets.
 * Grams are never stored. They are worked out from this row and the newest body weight each time
 * they are shown, so the protein target follows every new reading without anything rewriting it.
 */
export const nutritionTargets = pgTable(
  "nutrition_targets",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => profiles.id, { onDelete: "cascade" }),
    /** The day's energy target, in whole kilocalories. */
    dailyKcal: integer("daily_kcal").notNull(),
    proteinPerKg: numeric("protein_per_kg", { precision: 3, scale: 1, mode: "number" })
      .notNull()
      .default(1.8),
    macroSplit: text("macro_split").$type<MacroSplit>().notNull().default("body_weight"),
    ...timestamps,
  },
  () => [
    check(
      "nutrition_targets_values_chk",
      sql`daily_kcal between 500 and 10000
        and protein_per_kg between 0.5 and 4
        and macro_split in ('body_weight', 'fixed_55_25_20')`,
    ),
    ownerPolicy("nutrition_targets"),
  ],
).enableRLS();

/**
 * A starred meal: a copy of a meal's foods, kept for adding again in one tap.
 *
 * A copy, not a reference, and stored whole, as a saved routine is: it is only ever written at
 * once and read at once. Editing or deleting a day's meal never changes it; unstarring deletes it.
 */
export const savedMeals = pgTable(
  "saved_meals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    name: text("name").notNull(),
    items: jsonb("items").$type<FoodItem[]>().notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("saved_meals_owner_id_uq").on(t.userId, t.id),
    check(
      "saved_meals_values_chk",
      sql`char_length(name) between 1 and 80
        and jsonb_typeof(items) = 'array'
        and jsonb_array_length(items) between 1 and 30`,
    ),
    ownerPolicy("saved_meals"),
  ],
).enableRLS();

/**
 * One meal eaten on one day. Food counts towards a day only inside a meal, so a day's total is
 * the sum of its meals' items and nothing else.
 */
export const meals = pgTable(
  "meals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    /** The civil date in the account's own time zone, like a body weight reading. */
    eatenOn: date("eaten_on").notNull(),
    name: text("name").notNull(),
    /**
     * The starred copy this meal was added from, or starred into: what the Food screen draws its
     * star from. Unstarring deletes the copy, which clears this on every meal that pointed at it.
     */
    savedMealId: uuid("saved_meal_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("meals_owner_id_uq").on(t.userId, t.id),
    index("meals_user_day_idx").on(t.userId, t.eatenOn),
    // A meal can only point at its own owner's starred meal. The migration writes
    // `on delete set null (saved_meal_id)` so the owner is not nulled with it.
    foreignKey({
      name: "meals_saved_meal_fk",
      columns: [t.userId, t.savedMealId],
      foreignColumns: [savedMeals.userId, savedMeals.id],
    }).onDelete("set null"),
    check("meals_name_chk", sql`char_length(name) between 1 and 80`),
    ownerPolicy("meals"),
  ],
).enableRLS();

/**
 * The foods in a meal, in the order they were entered. Only the energy is required, so a guessed
 * takeaway is one number; a macronutrient left out is unknown, and adds nothing to a total.
 */
export const mealItems = pgTable(
  "meal_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    mealId: uuid("meal_id").notNull(),
    position: integer("position").notNull(),
    name: text("name"),
    kcal: numeric("kcal", { precision: 6, scale: 1, mode: "number" }).notNull(),
    carbsG: numeric("carbs_g", { precision: 5, scale: 1, mode: "number" }),
    fatG: numeric("fat_g", { precision: 5, scale: 1, mode: "number" }),
    proteinG: numeric("protein_g", { precision: 5, scale: 1, mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("meal_items_meal_position_uq").on(t.mealId, t.position),
    // An item belongs to a meal of its own owner's, and goes with it.
    foreignKey({
      name: "meal_items_meal_fk",
      columns: [t.userId, t.mealId],
      foreignColumns: [meals.userId, meals.id],
    }).onDelete("cascade"),
    check(
      "meal_items_values_chk",
      sql`position >= 0
        and (name is null or char_length(name) between 1 and 80)
        and kcal between 0 and 10000
        and (carbs_g is null or carbs_g between 0 and 1000)
        and (fat_g is null or fat_g between 0 and 1000)
        and (protein_g is null or protein_g between 0 and 1000)`,
    ),
    ownerPolicy("meal_items"),
  ],
).enableRLS();
