import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { createHash } from "node:crypto";

import { isUniqueViolation } from "@/db/errors";
import {
  foodEntries,
  foods,
  foodSubmissionReceipts,
  nutritionTargets,
  profiles,
  savedMeals,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import {
  addUp,
  eaten,
  NUTRITION_LIMITS,
  overLimit,
  type Food,
  type FoodAmounts,
  type FoodTotals,
  type LoggedFood,
  type Meal,
  type NutritionTargets,
} from "@/domain/nutrition";

/** A food in My foods. */
export type FoodRecord = Food & { id: string };

/** One food eaten in one of a day's meals. */
export type EntryRecord = LoggedFood & { id: string; eatenOn: string; meal: Meal };

export type SavedMealRecord = { id: string; name: string; items: LoggedFood[] };

/** How many foods and saved meals an account keeps in My foods, for the Food screen's row. */
export type LibraryCount = { foods: number; meals: number };

/**
 * A day: the targets, if any are set, what was eaten in each of its meals, and what that came to.
 * The Food screen draws all three, and says how much My foods holds.
 */
export type FoodDay = {
  targets: NutritionTargets | null;
  entries: EntryRecord[];
  eaten: FoodTotals;
  library: LibraryCount;
};

/** My foods: every food and saved meal an account keeps (ADR 0035). */
export type Library = {
  foods: FoodRecord[];
  savedMeals: SavedMealRecord[];
};

/** One meal's page: what is in it, and what can be added to it. */
export type MealScreen = Library & { entries: EntryRecord[] };

/** Where a food is being logged: a meal of a day. */
export type MealOf = { eatenOn: string; meal: Meal };

export class FoodNotFoundError extends Error {
  constructor() {
    super("That food is no longer in your foods.");
  }
}

export class EntryNotFoundError extends Error {
  constructor() {
    super("That food is no longer in this meal.");
  }
}

export class SavedMealNotFoundError extends Error {
  constructor() {
    super("That saved meal no longer exists.");
  }
}

export class EmptyMealError extends Error {
  constructor() {
    super("There is nothing in this meal to save.");
  }
}

export class SavedMealTooLargeError extends Error {
  constructor() {
    super(`A saved meal holds at most ${NUTRITION_LIMITS.itemsPerMeal} foods.`);
  }
}

/** A meal built in My foods needs a name no other saved meal has, whatever its capitals. */
export class SavedMealNameTakenError extends Error {
  constructor(name: string) {
    super(`You already have a meal called ${name}.`);
  }
}

/** A food kept from a saved meal that has since changed under the page that was editing it. */
export class SavedMealChangedError extends Error {
  constructor() {
    super("This meal changed since it was opened. Go back to My foods and open it again.");
  }
}

/** A food's name is taken, whatever its capitals: My foods never lists two of one thing. */
export class FoodNameTakenError extends Error {
  constructor(name: string) {
    super(`You already have a food called ${name}.`);
  }
}

const TOO_MUCH: Record<keyof FoodAmounts, string> = {
  kcal: `That comes to more than ${NUTRITION_LIMITS.itemKcal.toLocaleString("en-GB")} kcal.`,
  carbsG: `That comes to more than ${NUTRITION_LIMITS.itemGrams.toLocaleString("en-GB")} g of carbs.`,
  fatG: `That comes to more than ${NUTRITION_LIMITS.itemGrams.toLocaleString("en-GB")} g of fat.`,
  proteinG: `That comes to more than ${NUTRITION_LIMITS.itemGrams.toLocaleString("en-GB")} g of protein.`,
};

/** An amount that would take one food eaten past the bounds that catch a slipped finger. */
export class AmountTooLargeError extends Error {
  constructor(figure: keyof FoodAmounts) {
    super(TOO_MUCH[figure]);
  }
}

export class FoodSubmissionConflictError extends Error {
  constructor() {
    super(
      "This was already saved with different values. Close it and check the meal before trying again.",
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
  fatPercent: nutritionTargets.fatPercent,
};

const FOOD_COLUMNS = {
  name: foods.name,
  portionAmount: foods.portionAmount,
  unit: foods.unit,
  kcal: foods.kcal,
  carbsG: foods.carbsG,
  fatG: foods.fatG,
  proteinG: foods.proteinG,
};

const ENTRY_COLUMNS = {
  // Drizzle takes a LEFT JOIN row to be absent when its first column is null, so the first is
  // the one that never is.
  id: foodEntries.id,
  eatenOn: foodEntries.eatenOn,
  meal: foodEntries.meal,
  foodId: foodEntries.foodId,
  name: foodEntries.name,
  portionAmount: foodEntries.portionAmount,
  unit: foodEntries.unit,
  kcal: foodEntries.kcal,
  carbsG: foodEntries.carbsG,
  fatG: foodEntries.fatG,
  proteinG: foodEntries.proteinG,
  amount: foodEntries.amount,
};

/** In the order they were logged; foods logged together, in the order they were given. */
const ENTRY_ORDER = [asc(foodEntries.createdAt), asc(foodEntries.position), asc(foodEntries.id)];

/**
 * The foods eaten most lately first; a food saved in My foods and not eaten yet counts from when
 * it was saved, so what was just made is near the top.
 */
const FOOD_ORDER = [
  sql`coalesce(${foods.lastLoggedAt}, ${foods.createdAt}) desc`,
  asc(sql`lower(${foods.name})`),
];

/**
 * A day's targets, everything eaten on it and how much My foods holds, in one statement.
 *
 * Anchored on the account's own profile row, which always exists, so there is always a row to
 * read the targets from, whether or not anything was eaten.
 */
export async function readFoodDay(db: DbOrTx, userId: string, eatenOn: string): Promise<FoodDay> {
  const rows = await db
    .select({
      ...TARGET_COLUMNS,
      foodCount: sql<number>`(select count(*)::int from ${foods} where ${foods.userId} = ${profiles.id})`,
      mealCount: sql<number>`(select count(*)::int from ${savedMeals} where ${savedMeals.userId} = ${profiles.id})`,
      entry: ENTRY_COLUMNS,
    })
    .from(profiles)
    .leftJoin(nutritionTargets, eq(nutritionTargets.userId, profiles.id))
    .leftJoin(
      foodEntries,
      and(eq(foodEntries.userId, profiles.id), eq(foodEntries.eatenOn, eatenOn)),
    )
    .where(eq(profiles.id, userId))
    .orderBy(...ENTRY_ORDER);
  const [first] = rows;
  const targets =
    first && first.dailyKcal !== null && first.proteinPerKg !== null && first.fatPercent !== null
      ? {
          dailyKcal: first.dailyKcal,
          proteinPerKg: first.proteinPerKg,
          fatPercent: first.fatPercent,
        }
      : null;
  const entries = rows.flatMap(({ entry }) => (entry ? [entry] : []));
  return {
    targets,
    entries,
    eaten: addUp(entries.map(eaten)),
    library: { foods: Number(first?.foodCount ?? 0), meals: Number(first?.mealCount ?? 0) },
  };
}

/** The targets alone, for the Targets screen: null until the account has set some. */
export async function readTargets(db: DbOrTx, userId: string): Promise<NutritionTargets | null> {
  const [row] = await db
    .select(TARGET_COLUMNS)
    .from(nutritionTargets)
    .where(eq(nutritionTargets.userId, userId))
    .limit(1);
  return row ?? null;
}

/**
 * A saved meal's foods as a `LoggedFood` each. The previous deployment, still serving while this
 * one builds, may write the old shape (a name or none, and figures); those read as one serving.
 */
function loggedFoods(items: readonly Partial<LoggedFood>[], mealName: string): LoggedFood[] {
  return items.map((item) => {
    const portionAmount = item.portionAmount ?? 1;
    return {
      foodId: item.foodId ?? null,
      name: item.name?.trim() || mealName,
      portionAmount,
      unit: item.unit ?? "serving",
      kcal: item.kcal ?? 0,
      carbsG: item.carbsG ?? null,
      fatG: item.fatG ?? null,
      proteinG: item.proteinG ?? null,
      amount: item.amount ?? portionAmount,
    };
  });
}

/** My foods: the foods, the most lately eaten first, and the saved meals by name. */
export async function readLibrary(db: DbOrTx, userId: string): Promise<Library> {
  const [library, saved] = await Promise.all([
    db
      .select({ id: foods.id, ...FOOD_COLUMNS })
      .from(foods)
      .where(eq(foods.userId, userId))
      .orderBy(...FOOD_ORDER),
    db
      .select({ id: savedMeals.id, name: savedMeals.name, items: savedMeals.items })
      .from(savedMeals)
      .where(eq(savedMeals.userId, userId))
      .orderBy(asc(sql`lower(${savedMeals.name})`), asc(savedMeals.createdAt)),
  ]);
  return {
    foods: library,
    savedMeals: saved.map((row) => ({ ...row, items: loggedFoods(row.items, row.name) })),
  };
}

/** One meal of a day, with everything in My foods that can be added to it. */
export async function readMealScreen(
  db: DbOrTx,
  userId: string,
  { eatenOn, meal }: MealOf,
): Promise<MealScreen> {
  const [entries, library] = await Promise.all([
    db
      .select(ENTRY_COLUMNS)
      .from(foodEntries)
      .where(
        and(
          eq(foodEntries.userId, userId),
          eq(foodEntries.eatenOn, eatenOn),
          eq(foodEntries.meal, meal),
        ),
      )
      .orderBy(...ENTRY_ORDER),
    readLibrary(db, userId),
  ]);
  return { entries, ...library };
}

/** One saved meal, as My foods edits it; null when it is not the account's or no longer exists. */
export async function readSavedMeal(
  db: DbOrTx,
  userId: string,
  savedMealId: string,
): Promise<SavedMealRecord | null> {
  const [row] = await db
    .select({ id: savedMeals.id, name: savedMeals.name, items: savedMeals.items })
    .from(savedMeals)
    .where(and(eq(savedMeals.userId, userId), eq(savedMeals.id, savedMealId)))
    .limit(1);
  return row ? { ...row, items: loggedFoods(row.items, row.name) } : null;
}

export async function saveNutritionTargets(
  db: DbOrTx,
  userId: string,
  targets: NutritionTargets,
): Promise<void> {
  const values = {
    dailyKcal: targets.dailyKcal,
    proteinPerKg: targets.proteinPerKg,
    fatPercent: targets.fatPercent,
    // Read only by the previous deployment while it still serves: body weight is what these
    // targets are, protein per kilogram, so it shows the same protein (ADR 0035).
    macroSplit: "body_weight" as const,
  };
  await db
    .insert(nutritionTargets)
    .values({ userId, ...values })
    .onConflictDoUpdate({
      target: nutritionTargets.userId,
      set: { ...values, updatedAt: new Date() },
    });
}

/** Refuses a name another of the account's foods has, whatever its capitals. */
async function assertNameFree(
  db: DbOrTx,
  userId: string,
  name: string,
  except?: string,
): Promise<void> {
  const [taken] = await db
    .select({ id: foods.id })
    .from(foods)
    .where(
      and(
        eq(foods.userId, userId),
        sql`lower(${foods.name}) = lower(${name})`,
        except ? ne(foods.id, except) : undefined,
      ),
    )
    .limit(1);
  if (taken) throw new FoodNameTakenError(name);
}

/** A write that may meet another request's food of the same name, said the same way. */
async function naming<T>(name: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isUniqueViolation(error)) throw new FoodNameTakenError(name);
    throw error;
  }
}

/** The foods were just eaten, so My foods lists them first. */
async function touchFoods(db: DbOrTx, userId: string, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(foods)
    .set({ lastLoggedAt: sql`now()` })
    .where(and(eq(foods.userId, userId), inArray(foods.id, [...ids])));
}

function entryValues(userId: string, at: MealOf, food: LoggedFood, position = 0) {
  return {
    userId,
    eatenOn: at.eatenOn,
    meal: at.meal,
    position,
    foodId: food.foodId,
    name: food.name,
    portionAmount: food.portionAmount,
    unit: food.unit,
    kcal: food.kcal,
    carbsG: food.carbsG,
    fatG: food.fatG,
    proteinG: food.proteinG,
    amount: food.amount,
  };
}

/**
 * Logs an amount of a food in a meal. A food from My foods is copied as it stands; a new one is
 * added to My foods first, which is how a food is saved: by being logged (ADR 0033).
 */
export async function logFood(
  db: DbOrTx,
  userId: string,
  at: MealOf,
  input: { food: { id: string } | Food; amount: number },
): Promise<string> {
  let food: Food;
  let foodId: string | null = null;
  if ("id" in input.food) {
    foodId = input.food.id;
    const [found] = await db
      .select(FOOD_COLUMNS)
      .from(foods)
      .where(and(eq(foods.userId, userId), eq(foods.id, foodId)))
      .limit(1);
    if (!found) throw new FoodNotFoundError();
    food = found;
  } else {
    food = input.food;
    await assertNameFree(db, userId, food.name);
  }
  const tooMuch = overLimit(food, input.amount);
  if (tooMuch) throw new AmountTooLargeError(tooMuch);

  if (foodId) {
    await touchFoods(db, userId, [foodId]);
  } else {
    const [created] = await naming(food.name, () =>
      db
        .insert(foods)
        .values({ userId, ...food, lastLoggedAt: sql`now()` })
        .returning({ id: foods.id }),
    );
    if (!created) throw new Error("The food could not be saved.");
    foodId = created.id;
  }

  const [entry] = await db
    .insert(foodEntries)
    .values(entryValues(userId, at, { ...food, foodId, amount: input.amount }))
    .returning({ id: foodEntries.id });
  if (!entry) throw new Error("The food could not be logged.");
  return entry.id;
}

/**
 * Keeps a new food in My foods without eating any of it (ADR 0035). Its recency starts from now,
 * so it is near the top of the list it was just added to.
 */
export async function createFood(db: DbOrTx, userId: string, food: Food): Promise<string> {
  await assertNameFree(db, userId, food.name);
  const [created] = await naming(food.name, () =>
    db
      .insert(foods)
      .values({ userId, ...food })
      .returning({ id: foods.id }),
  );
  if (!created) throw new Error("The food could not be saved.");
  return created.id;
}

/** Changes how much of a food was eaten. What it came to follows, from the entry's own copy. */
export async function updateEntryAmount(
  db: DbOrTx,
  userId: string,
  entryId: string,
  amount: number,
): Promise<void> {
  const [entry] = await db
    .select(ENTRY_COLUMNS)
    .from(foodEntries)
    .where(and(eq(foodEntries.userId, userId), eq(foodEntries.id, entryId)))
    .limit(1)
    .for("update");
  if (!entry) throw new EntryNotFoundError();
  const tooMuch = overLimit(entry, amount);
  if (tooMuch) throw new AmountTooLargeError(tooMuch);
  await db
    .update(foodEntries)
    .set({ amount, updatedAt: new Date() })
    .where(and(eq(foodEntries.userId, userId), eq(foodEntries.id, entryId)));
}

/** Takes a food out of a meal. False when it was already gone, which is the same outcome. */
export async function deleteEntry(db: DbOrTx, userId: string, entryId: string): Promise<boolean> {
  const deleted = await db
    .delete(foodEntries)
    .where(and(eq(foodEntries.userId, userId), eq(foodEntries.id, entryId)))
    .returning({ id: foodEntries.id });
  return deleted.length > 0;
}

/**
 * Saves a meal as it stands under a name: a copy of its foods and how much of each (ADR 0033).
 *
 * A name already given to a saved meal, whatever its capitals, is that meal saved again, so
 * "Usual breakfast" can be brought up to date by starring today's under the same name.
 */
export async function saveMeal(
  db: DbOrTx,
  userId: string,
  at: MealOf,
  name: string,
): Promise<string> {
  const entries = await db
    .select(ENTRY_COLUMNS)
    .from(foodEntries)
    .where(
      and(
        eq(foodEntries.userId, userId),
        eq(foodEntries.eatenOn, at.eatenOn),
        eq(foodEntries.meal, at.meal),
      ),
    )
    .orderBy(...ENTRY_ORDER);
  if (entries.length === 0) throw new EmptyMealError();
  if (entries.length > NUTRITION_LIMITS.itemsPerMeal) throw new SavedMealTooLargeError();
  const items: LoggedFood[] = entries.map((entry) => ({
    foodId: entry.foodId,
    name: entry.name,
    portionAmount: entry.portionAmount,
    unit: entry.unit,
    kcal: entry.kcal,
    carbsG: entry.carbsG,
    fatG: entry.fatG,
    proteinG: entry.proteinG,
    amount: entry.amount,
  }));

  const [existing] = await db
    .select({ id: savedMeals.id })
    .from(savedMeals)
    .where(and(eq(savedMeals.userId, userId), sql`lower(${savedMeals.name}) = lower(${name})`))
    .orderBy(asc(savedMeals.createdAt))
    .limit(1)
    .for("update");
  if (existing) {
    await db
      .update(savedMeals)
      .set({ name, items, updatedAt: new Date() })
      .where(and(eq(savedMeals.userId, userId), eq(savedMeals.id, existing.id)));
    return existing.id;
  }
  const [saved] = await db
    .insert(savedMeals)
    .values({ userId, name, items })
    .returning({ id: savedMeals.id });
  if (!saved) throw new Error("The meal could not be saved.");
  return saved.id;
}

/**
 * Adds a saved meal's foods to a meal, as they were saved. A food since deleted from My foods is
 * still added, from the copy; only its link to My foods is gone.
 */
export async function logSavedMeal(
  db: DbOrTx,
  userId: string,
  savedMealId: string,
  at: MealOf,
): Promise<void> {
  const [saved] = await db
    .select({ name: savedMeals.name, items: savedMeals.items })
    .from(savedMeals)
    .where(and(eq(savedMeals.userId, userId), eq(savedMeals.id, savedMealId)))
    .limit(1);
  if (!saved) throw new SavedMealNotFoundError();
  const items = loggedFoods(saved.items, saved.name);
  const linked = items.flatMap((item) => (item.foodId ? [item.foodId] : []));
  const present = new Set(
    linked.length === 0
      ? []
      : (
          await db
            .select({ id: foods.id })
            .from(foods)
            .where(and(eq(foods.userId, userId), inArray(foods.id, linked)))
        ).map((row) => row.id),
  );
  await db
    .insert(foodEntries)
    .values(
      items.map((item, position) =>
        entryValues(
          userId,
          at,
          { ...item, foodId: item.foodId && present.has(item.foodId) ? item.foodId : null },
          position,
        ),
      ),
    );
  await touchFoods(db, userId, [...present]);
}

/**
 * One food of a meal being built in My foods: a food from My foods at an amount, or one the saved
 * meal already holds, by its place in it, kept as it was saved at a new amount.
 */
export type LibraryMealItem = { foodId: string; amount: number } | { keep: number; amount: number };

/**
 * Saves a meal built in My foods (ADR 0035): new, or `id` saved again with what it now holds.
 *
 * A food from My foods is copied as it stands, as logging it would be; a food the meal already
 * held keeps the copy it was saved with, so a food corrected or deleted since is still what the
 * meal adds. A name another saved meal has is refused rather than saved over, since here it is
 * typed as the meal's own name, not chosen to bring another meal up to date.
 */
export async function saveLibraryMeal(
  db: DbOrTx,
  userId: string,
  input: { id?: string; name: string; items: readonly LibraryMealItem[] },
): Promise<string> {
  if (input.items.length === 0) throw new EmptyMealError();
  if (input.items.length > NUTRITION_LIMITS.itemsPerMeal) throw new SavedMealTooLargeError();

  let held: LoggedFood[] = [];
  if (input.id) {
    const [existing] = await db
      .select({ name: savedMeals.name, items: savedMeals.items })
      .from(savedMeals)
      .where(and(eq(savedMeals.userId, userId), eq(savedMeals.id, input.id)))
      .limit(1)
      .for("update");
    if (!existing) throw new SavedMealNotFoundError();
    held = loggedFoods(existing.items, existing.name);
  }

  const [taken] = await db
    .select({ id: savedMeals.id })
    .from(savedMeals)
    .where(
      and(
        eq(savedMeals.userId, userId),
        sql`lower(${savedMeals.name}) = lower(${input.name})`,
        input.id ? ne(savedMeals.id, input.id) : undefined,
      ),
    )
    .limit(1);
  if (taken) throw new SavedMealNameTakenError(input.name);

  const wanted = input.items.flatMap((item) => ("foodId" in item ? [item.foodId] : []));
  const library = new Map(
    (wanted.length === 0
      ? []
      : await db
          .select({ id: foods.id, ...FOOD_COLUMNS })
          .from(foods)
          .where(and(eq(foods.userId, userId), inArray(foods.id, wanted)))
    ).map(({ id, ...food }) => [id, food] as const),
  );

  const items: LoggedFood[] = input.items.map((item) => {
    let copy: LoggedFood;
    if ("foodId" in item) {
      const food = library.get(item.foodId);
      if (!food) throw new FoodNotFoundError();
      copy = { ...food, foodId: item.foodId, amount: item.amount };
    } else {
      const kept = held[item.keep];
      if (!kept) throw new SavedMealChangedError();
      copy = { ...kept, amount: item.amount };
    }
    const tooMuch = overLimit(copy, item.amount);
    if (tooMuch) throw new AmountTooLargeError(tooMuch);
    return copy;
  });

  if (input.id) {
    await db
      .update(savedMeals)
      .set({ name: input.name, items, updatedAt: new Date() })
      .where(and(eq(savedMeals.userId, userId), eq(savedMeals.id, input.id)));
    return input.id;
  }
  const [saved] = await db
    .insert(savedMeals)
    .values({ userId, name: input.name, items })
    .returning({ id: savedMeals.id });
  if (!saved) throw new Error("The meal could not be saved.");
  return saved.id;
}

/** Deletes a saved meal. The meals it was added to keep their foods. */
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

/**
 * Corrects a food in My foods. Days already eaten keep the copy they logged, and saved meals the
 * copy they saved: only what is logged from now on uses the correction.
 */
export async function updateFood(
  db: DbOrTx,
  userId: string,
  foodId: string,
  food: Food,
): Promise<void> {
  await assertNameFree(db, userId, food.name, foodId);
  const updated = await naming(food.name, () =>
    db
      .update(foods)
      .set({ ...food, updatedAt: new Date() })
      .where(and(eq(foods.userId, userId), eq(foods.id, foodId)))
      .returning({ id: foods.id }),
  );
  if (updated.length === 0) throw new FoodNotFoundError();
}

/** Removes a food from My foods. What was logged from it stays, as its own copy. */
export async function deleteFood(db: DbOrTx, userId: string, foodId: string): Promise<boolean> {
  const deleted = await db
    .delete(foods)
    .where(and(eq(foods.userId, userId), eq(foods.id, foodId)))
    .returning({ id: foods.id });
  return deleted.length > 0;
}
