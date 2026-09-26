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
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  FOOD_UNITS,
  MEALS,
  type FoodUnit,
  type LoggedFood,
  type Meal,
} from "../../domain/nutrition";
import { ownerPolicy, serverWritePolicies, timestamps } from "./common";
import { profiles } from "./profiles";

/*
 * Food (ADRs 0032, 0033, 0035). Each account owns its targets, its foods, what it ate, its saved meals
 * and its save receipts. The bounds in the check constraints are `NUTRITION_LIMITS` in
 * `domain/nutrition.ts`, and the lists of units and meals are that module's own.
 */

/** A list of allowed values for a check constraint. */
const oneOf = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(", "));

/** What a food holds per portion: the same columns, and bounds, wherever a food is kept. */
const portionColumns = () => ({
  name: text("name").notNull(),
  portionAmount: numeric("portion_amount", { precision: 7, scale: 2, mode: "number" }).notNull(),
  unit: text("unit").$type<FoodUnit>().notNull(),
  kcal: numeric("kcal", { precision: 6, scale: 1, mode: "number" }).notNull(),
  carbsG: numeric("carbs_g", { precision: 5, scale: 1, mode: "number" }),
  fatG: numeric("fat_g", { precision: 5, scale: 1, mode: "number" }),
  proteinG: numeric("protein_g", { precision: 5, scale: 1, mode: "number" }),
});

const PORTION_CHECK = sql`char_length(name) between 1 and 80
        and portion_amount > 0 and portion_amount <= 10000
        and unit in (${oneOf(FOOD_UNITS)})
        and kcal between 0 and 10000
        and (carbs_g is null or carbs_g between 0 and 1000)
        and (fat_g is null or fat_g between 0 and 1000)
        and (protein_g is null or protein_g between 0 and 1000)`;

const owner = () =>
  uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" });

/** A committed save keeps its receipt even if the meal is later deleted. */
export const foodSubmissionReceipts = pgTable(
  "food_submission_receipts",
  {
    userId: owner(),
    submissionKey: uuid("submission_key").notNull(),
    payloadDigest: text("payload_digest").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.submissionKey] }),
    ...serverWritePolicies("food_submission_receipts"),
  ],
).enableRLS();

/**
 * What an account's eating is measured against: one row, written from the Targets screen.
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
    /** Fat's share of the day's energy, in whole percent (ADR 0035). */
    fatPercent: smallint("fat_percent").notNull().default(25),
    /**
     * Legacy (ADR 0035): the split the account chose before targets started from the training
     * goal. Migration 0042 moved every fixed split to protein per kilogram, and this deployment
     * writes `body_weight` and reads nothing here. It stays while the previous deployment, which
     * reads it, may still be serving; a later migration drops it.
     */
    macroSplit: text("macro_split")
      .$type<"body_weight" | "fixed_55_25_20">()
      .notNull()
      .default("body_weight"),
    ...timestamps,
  },
  () => [
    check(
      "nutrition_targets_values_chk",
      sql`daily_kcal between 500 and 10000
        and protein_per_kg between 0.5 and 4
        and fat_percent between 5 and 80
        and macro_split in ('body_weight', 'fixed_55_25_20')`,
    ),
    ownerPolicy("nutrition_targets"),
  ],
).enableRLS();

/**
 * My foods: every food an account has logged, kept so it can be logged again (ADR 0033). A name
 * and what one portion of it holds, e.g. 100 g of oats at 389 kcal; how much was eaten is the
 * entry's, never the food's. Names are unique per account whatever their capitals, so the list
 * never offers two of one thing.
 */
export const foods = pgTable(
  "foods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    ...portionColumns(),
    /** When it was last logged, so the foods eaten most lately come first. */
    lastLoggedAt: timestamp("last_logged_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("foods_owner_id_uq").on(t.userId, t.id),
    uniqueIndex("foods_owner_name_uq").on(t.userId, sql`lower(${t.name})`),
    check("foods_values_chk", PORTION_CHECK),
    ownerPolicy("foods"),
  ],
).enableRLS();

/**
 * One food eaten in one of a day's meals: a copy of the food as it was when it was logged, and how
 * much of it, in the food's own unit. What it came to is worked out from those two, by
 * `scaleFood`, wherever it is shown; a day's total is the sum of its entries and nothing else.
 *
 * A copy rather than a reference, so correcting or deleting a food in My foods never rewrites a
 * day already eaten. `food_id` remains only so the food's recency can follow it.
 */
export const foodEntries = pgTable(
  "food_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    /** The civil date in the account's own time zone, like a body weight reading. */
    eatenOn: date("eaten_on").notNull(),
    meal: text("meal").$type<Meal>().notNull(),
    /** Its place among foods logged together, as a saved meal's are; otherwise 0. */
    position: integer("position").notNull().default(0),
    foodId: uuid("food_id"),
    ...portionColumns(),
    amount: numeric("amount", { precision: 7, scale: 2, mode: "number" }).notNull(),
    ...timestamps,
  },
  (t) => [
    index("food_entries_user_day_idx").on(t.userId, t.eatenOn),
    // The food must be the owner's own. Deleting it clears only `food_id`: the migration writes
    // `on delete set null (food_id)`, since a bare `set null` would null the owner as well.
    foreignKey({
      name: "food_entries_food_fk",
      columns: [t.userId, t.foodId],
      foreignColumns: [foods.userId, foods.id],
    }).onDelete("set null"),
    check(
      "food_entries_values_chk",
      sql`meal in (${oneOf(MEALS)})
        and position >= 0
        and amount > 0 and amount <= 10000
        and ${PORTION_CHECK}`,
    ),
    ownerPolicy("food_entries"),
  ],
).enableRLS();

/**
 * A saved meal: the foods of a day's meal and how much of each, kept under a name so it can be
 * added to any meal in one go (ADR 0033). Starring a meal saves it.
 *
 * A copy, not a reference, and stored whole, as a saved routine is: it is only ever written at
 * once and read at once. Each item is a `LoggedFood`, like an entry, so a saved meal adds exactly
 * what was saved even after its foods are corrected or deleted.
 */
export const savedMeals = pgTable(
  "saved_meals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    name: text("name").notNull(),
    items: jsonb("items").$type<LoggedFood[]>().notNull(),
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

/*
 * Superseded by `food_entries` (ADR 0033). Migration 0041 copied every meal and its foods across;
 * nothing reads or writes these any more. They stay until the deployment that stopped using them
 * is live, because the build that applies 0041 runs while the previous deployment still serves
 * requests, and that deployment reads them. A later migration drops them.
 */

/** Legacy: one freely named meal eaten on one day. */
export const legacyMeals = pgTable(
  "meals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    /** The civil date in the account's own time zone, like a body weight reading. */
    eatenOn: date("eaten_on").notNull(),
    name: text("name").notNull(),
    savedMealId: uuid("saved_meal_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("meals_owner_id_uq").on(t.userId, t.id),
    index("meals_user_day_idx").on(t.userId, t.eatenOn),
    foreignKey({
      name: "meals_saved_meal_fk",
      columns: [t.userId, t.savedMealId],
      foreignColumns: [savedMeals.userId, savedMeals.id],
    }).onDelete("set null"),
    check("meals_name_chk", sql`char_length(name) between 1 and 80`),
    ownerPolicy("meals"),
  ],
).enableRLS();

/** Legacy: the foods in one of those meals. */
export const legacyMealItems = pgTable(
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
    foreignKey({
      name: "meal_items_meal_fk",
      columns: [t.userId, t.mealId],
      foreignColumns: [legacyMeals.userId, legacyMeals.id],
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
