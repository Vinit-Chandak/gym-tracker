import { and, asc, eq, sql, type AnyColumn } from "drizzle-orm";
import { createHash } from "node:crypto";

import {
  foodSubmissionReceipts,
  mealItems,
  meals,
  nutritionTargets,
  profiles,
  savedMeals,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { addUp, type FoodItem, type FoodTotals, type NutritionTargets } from "@/domain/nutrition";

/** What Today's card needs: the targets, if any are set, and what the day has come to. */
export type FoodDay = { targets: NutritionTargets | null; eaten: FoodTotals };

/** A meal as the Food screen shows it: its foods in the order they were entered, and their sum. */
export type MealRecord = {
  id: string;
  name: string;
  eatenOn: string;
  /** The starred copy it was added from or starred into; null when it is not starred. */
  savedMealId: string | null;
  items: FoodItem[];
  totals: FoodTotals;
};

export type SavedMealRecord = { id: string; name: string; items: FoodItem[]; totals: FoodTotals };

export type FoodScreen = {
  targets: NutritionTargets | null;
  meals: MealRecord[];
  savedMeals: SavedMealRecord[];
};

/** A meal as the sheet submits it. */
export type MealInput = { name: string; items: readonly FoodItem[]; starred: boolean };

export class MealNotFoundError extends Error {
  constructor() {
    super("That meal no longer exists.");
  }
}

export class SavedMealNotFoundError extends Error {
  constructor() {
    super("That starred meal no longer exists.");
  }
}

export class FoodSubmissionConflictError extends Error {
  constructor() {
    super(
      "This draft was already saved with different values. Close and reopen the saved meal before editing it. You can discard this local draft.",
    );
  }
}

/** Must run inside the same transaction as the write. A lost reply is safe to retry. */
export async function submitFoodOnce(
  db: DbOrTx,
  userId: string,
  key: string,
  payload: unknown,
  write: () => Promise<unknown>,
): Promise<void> {
  const payloadDigest = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const inserted = await db
    .insert(foodSubmissionReceipts)
    .values({ userId, submissionKey: key, payloadDigest })
    .onConflictDoNothing()
    .returning({ key: foodSubmissionReceipts.submissionKey });
  if (!inserted.length) {
    const [receipt] = await db
      .select()
      .from(foodSubmissionReceipts)
      .where(
        and(
          eq(foodSubmissionReceipts.userId, userId),
          eq(foodSubmissionReceipts.submissionKey, key),
        ),
      );
    if (receipt?.payloadDigest !== payloadDigest) throw new FoodSubmissionConflictError();
    return;
  }
  await write();
}

const TARGET_COLUMNS = {
  dailyKcal: nutritionTargets.dailyKcal,
  proteinPerKg: nutritionTargets.proteinPerKg,
  split: nutritionTargets.macroSplit,
};

/** A sum over the day's foods, exact in Postgres and handed back as a plain number. */
const total = (column: AnyColumn) =>
  sql<number>`coalesce(sum(${column}), 0)::float8`.mapWith(Number);

/**
 * The targets and the day's totals in one statement, for Today, which already waits on many.
 *
 * Anchored on the account's own profile row, which always exists, so the answer is exactly one
 * row whether or not there are targets or meals: nothing set reads as null, nothing eaten as 0.
 */
export async function readFoodDay(db: DbOrTx, userId: string, eatenOn: string): Promise<FoodDay> {
  const [row] = await db
    .select({
      ...TARGET_COLUMNS,
      kcal: total(mealItems.kcal),
      carbsG: total(mealItems.carbsG),
      fatG: total(mealItems.fatG),
      proteinG: total(mealItems.proteinG),
    })
    .from(profiles)
    .leftJoin(nutritionTargets, eq(nutritionTargets.userId, profiles.id))
    .leftJoin(meals, and(eq(meals.userId, profiles.id), eq(meals.eatenOn, eatenOn)))
    .leftJoin(mealItems, and(eq(mealItems.userId, meals.userId), eq(mealItems.mealId, meals.id)))
    .where(eq(profiles.id, userId))
    .groupBy(nutritionTargets.userId);
  if (!row) return { targets: null, eaten: addUp([]) };
  const { dailyKcal, proteinPerKg, split, ...eaten } = row;
  return {
    targets:
      dailyKcal !== null && proteinPerKg !== null && split !== null
        ? { dailyKcal, proteinPerKg, split }
        : null,
    eaten,
  };
}

/** Everything the Food screen shows for a day: targets, the day's meals, the starred meals. */
export async function readFoodScreen(
  db: DbOrTx,
  userId: string,
  eatenOn: string,
): Promise<FoodScreen> {
  const [[targets], rows, saved] = await Promise.all([
    db
      .select(TARGET_COLUMNS)
      .from(nutritionTargets)
      .where(eq(nutritionTargets.userId, userId))
      .limit(1),
    db
      .select({
        id: meals.id,
        name: meals.name,
        eatenOn: meals.eatenOn,
        savedMealId: meals.savedMealId,
        item: {
          // Drizzle detects an absent LEFT JOIN row from its first selected column.
          // Names are optional; the non-null primary key must be that sentinel.
          id: mealItems.id,
          name: mealItems.name,
          kcal: mealItems.kcal,
          carbsG: mealItems.carbsG,
          fatG: mealItems.fatG,
          proteinG: mealItems.proteinG,
        },
      })
      .from(meals)
      .leftJoin(mealItems, and(eq(mealItems.userId, meals.userId), eq(mealItems.mealId, meals.id)))
      .where(and(eq(meals.userId, userId), eq(meals.eatenOn, eatenOn)))
      // In the order they were eaten, as far as the order they were logged says.
      .orderBy(asc(meals.createdAt), asc(meals.id), asc(mealItems.position)),
    db
      .select({ id: savedMeals.id, name: savedMeals.name, items: savedMeals.items })
      .from(savedMeals)
      .where(eq(savedMeals.userId, userId))
      .orderBy(asc(savedMeals.createdAt), asc(savedMeals.id)),
  ]);

  const byId = new Map<string, MealRecord>();
  for (const { item, ...meal } of rows) {
    let record = byId.get(meal.id);
    if (!record) {
      record = { ...meal, items: [], totals: addUp([]) };
      byId.set(meal.id, record);
    }
    if (item) {
      const { id: _id, ...food } = item;
      record.items.push(food);
    }
  }
  for (const record of byId.values()) record.totals = addUp(record.items);

  return {
    targets: targets ?? null,
    meals: [...byId.values()],
    savedMeals: saved.map((meal) => ({ ...meal, totals: addUp(meal.items) })),
  };
}

export async function saveNutritionTargets(
  db: DbOrTx,
  userId: string,
  targets: NutritionTargets,
): Promise<void> {
  const values = {
    dailyKcal: targets.dailyKcal,
    proteinPerKg: targets.proteinPerKg,
    macroSplit: targets.split,
  };
  await db
    .insert(nutritionTargets)
    .values({ userId, ...values })
    .onConflictDoUpdate({
      target: nutritionTargets.userId,
      set: { ...values, updatedAt: new Date() },
    });
}

async function insertItems(
  db: DbOrTx,
  userId: string,
  mealId: string,
  items: readonly FoodItem[],
): Promise<void> {
  await db.insert(mealItems).values(
    items.map((item, position) => ({
      userId,
      mealId,
      position,
      name: item.name,
      kcal: item.kcal,
      carbsG: item.carbsG,
      fatG: item.fatG,
      proteinG: item.proteinG,
    })),
  );
}

/** A starred copy of what the sheet holds: its own row, which nothing edits afterwards. */
async function starCopy(db: DbOrTx, userId: string, meal: MealInput): Promise<string> {
  const [saved] = await db
    .insert(savedMeals)
    .values({
      userId,
      name: meal.name,
      items: meal.items.map(({ name, kcal, carbsG, fatG, proteinG }) => ({
        name,
        kcal,
        carbsG,
        fatG,
        proteinG,
      })),
    })
    .returning({ id: savedMeals.id });
  if (!saved) throw new Error("The starred meal could not be saved.");
  return saved.id;
}

/** Logs a meal on a day, and stars a copy of it when asked to. */
export async function createMeal(
  db: DbOrTx,
  userId: string,
  eatenOn: string,
  input: MealInput,
): Promise<string> {
  const savedMealId = input.starred ? await starCopy(db, userId, input) : null;
  const [meal] = await db
    .insert(meals)
    .values({ userId, eatenOn, name: input.name, savedMealId })
    .returning({ id: meals.id });
  if (!meal) throw new Error("The meal could not be saved.");
  await insertItems(db, userId, meal.id, input.items);
  return meal.id;
}

/**
 * Rewrites a meal with what the sheet holds, on the day it was eaten.
 *
 * The star is the starred copy's existence. Turning it on stars a copy of the meal as it now
 * stands; turning it off deletes the copy, which takes the star off every meal that pointed at
 * it. Leaving it on changes nothing about the copy: correcting today's portion of a starred
 * meal must not quietly change what the star adds tomorrow.
 */
export async function updateMeal(
  db: DbOrTx,
  userId: string,
  mealId: string,
  input: MealInput,
): Promise<void> {
  const [meal] = await db
    .select({ savedMealId: meals.savedMealId })
    .from(meals)
    .where(and(eq(meals.userId, userId), eq(meals.id, mealId)))
    .limit(1)
    .for("update");
  if (!meal) throw new MealNotFoundError();

  let savedMealId = meal.savedMealId;
  if (input.starred && savedMealId === null) {
    savedMealId = await starCopy(db, userId, input);
  } else if (!input.starred && savedMealId !== null) {
    await deleteSavedMeal(db, userId, savedMealId);
    savedMealId = null;
  }

  await db
    .update(meals)
    .set({ name: input.name, savedMealId, updatedAt: new Date() })
    .where(and(eq(meals.userId, userId), eq(meals.id, mealId)));
  await db.delete(mealItems).where(and(eq(mealItems.userId, userId), eq(mealItems.mealId, mealId)));
  await insertItems(db, userId, mealId, input.items);
}

/** Deletes a meal and its foods. False when it was already gone, which is the same outcome. */
export async function deleteMeal(db: DbOrTx, userId: string, mealId: string): Promise<boolean> {
  const deleted = await db
    .delete(meals)
    .where(and(eq(meals.userId, userId), eq(meals.id, mealId)))
    .returning({ id: meals.id });
  return deleted.length > 0;
}

/** Adds a starred meal to a day: a new meal holding a copy of its foods, pointing back at it. */
export async function logSavedMeal(
  db: DbOrTx,
  userId: string,
  savedMealId: string,
  eatenOn: string,
): Promise<string> {
  const [saved] = await db
    .select({ name: savedMeals.name, items: savedMeals.items })
    .from(savedMeals)
    .where(and(eq(savedMeals.userId, userId), eq(savedMeals.id, savedMealId)))
    .limit(1);
  if (!saved) throw new SavedMealNotFoundError();
  const [meal] = await db
    .insert(meals)
    .values({ userId, eatenOn, name: saved.name, savedMealId })
    .returning({ id: meals.id });
  if (!meal) throw new Error("The meal could not be saved.");
  await insertItems(db, userId, meal.id, saved.items);
  return meal.id;
}

/** Unstars a meal. Meals already logged from it keep their foods and lose only the star. */
export async function deleteSavedMeal(
  db: DbOrTx,
  userId: string,
  savedMealId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(savedMeals)
    .where(and(eq(savedMeals.userId, userId), eq(savedMeals.id, savedMealId)))
    .returning({ id: savedMeals.id });
  return deleted.length > 0;
}
