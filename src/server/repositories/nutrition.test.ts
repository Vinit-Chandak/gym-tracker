import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mealItems, meals, savedMeals } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import type { FoodItem } from "@/domain/nutrition";
import { ensureProfile } from "@/server/queries/profile";

import {
  createMeal,
  submitFoodOnce,
  deleteMeal,
  deleteSavedMeal,
  logSavedMeal,
  MealNotFoundError,
  readFoodDay,
  readFoodScreen,
  SavedMealNotFoundError,
  saveNutritionTargets,
  updateMeal,
} from "./nutrition";

let t: TestDatabase;
let user: { id: string; email: string };
let other: { id: string; email: string };

const TODAY = "2026-09-25";
const YESTERDAY = "2026-09-24";

const PEANUT_BUTTER: FoodItem = {
  name: "Peanut butter, 75 g",
  kcal: 441.5,
  carbsG: 15,
  fatG: 37.5,
  proteinG: 18.8,
};
const MILK: FoodItem = { name: "Milk, 250 ml", kcal: 160, carbsG: 12, fatG: 8, proteinG: 8.5 };
/** A guessed takeaway: the energy and nothing else. */
const TAKEAWAY: FoodItem = { name: null, kcal: 900, carbsG: null, fatG: null, proteinG: null };

/** Drizzle wraps driver errors ("Failed query: …"); the Postgres message sits in `cause`. */
async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const parts: string[] = [];
    let current: unknown = error;
    while (current instanceof Error) {
      parts.push(current.message);
      current = current.cause;
    }
    return parts.join(" | ");
  }
  throw new Error("expected the query to fail");
}

const as = <T>(account: { id: string }, fn: Parameters<typeof withUser<T>>[2]) =>
  withUser(t.db, account.id, fn);

beforeAll(async () => {
  t = await createTestDatabase();
  user = await t.createAuthUser("eater@example.test");
  other = await t.createAuthUser("other-eater@example.test");
  for (const account of [user, other]) {
    await withUser(t.db, account.id, (tx) => ensureProfile(tx, account));
  }
});

it("retries a committed save without duplicating meals or stars, even after deletion", async () => {
  const key = crypto.randomUUID();
  const input = { name: "Receipt meal", items: [MILK], starred: true };
  const save = () =>
    as(user, (tx) =>
      submitFoodOnce(tx, user.id, key, input, () => createMeal(tx, user.id, TODAY, input)),
    );
  await save();
  await save();
  const matching = (await as(user, (tx) => readFoodScreen(tx, user.id, TODAY))).meals.filter(
    (m) => m.name === input.name,
  );
  expect(matching).toHaveLength(1);
  await expect(
    as(user, (tx) =>
      submitFoodOnce(tx, user.id, key, { ...input, name: "Changed" }, () =>
        createMeal(tx, user.id, TODAY, input),
      ),
    ),
  ).rejects.toThrow(/already saved/);
  await as(user, (tx) => deleteMeal(tx, user.id, matching[0]!.id));
  await save();
  expect(
    (await as(user, (tx) => readFoodScreen(tx, user.id, TODAY))).meals.some(
      (m) => m.name === input.name,
    ),
  ).toBe(false);
  await as(user, (tx) => deleteSavedMeal(tx, user.id, matching[0]!.savedMealId!));
});

it("rolls the receipt back when the save fails and scopes keys to the account", async () => {
  const key = crypto.randomUUID();
  const input = { name: "Retry after rollback", items: [MILK], starred: false };
  await expect(
    as(user, (tx) =>
      submitFoodOnce(tx, user.id, key, input, async () => {
        throw new Error("write failed");
      }),
    ),
  ).rejects.toThrow("write failed");
  for (const account of [user, other])
    await as(account, (tx) =>
      submitFoodOnce(tx, account.id, key, input, () => createMeal(tx, account.id, TODAY, input)),
    );
  for (const account of [user, other])
    expect(
      (await as(account, (tx) => readFoodScreen(tx, account.id, TODAY))).meals.filter(
        (m) => m.name === input.name,
      ),
    ).toHaveLength(1);
  for (const account of [user, other])
    await as(account, (tx) => tx.delete(meals).where(eq(meals.userId, account.id)));
});

afterAll(async () => {
  await t.close();
});

describe("targets", () => {
  it("reads nothing set and nothing eaten as exactly that", async () => {
    expect(await as(user, (tx) => readFoodDay(tx, user.id, TODAY))).toEqual({
      targets: null,
      eaten: { kcal: 0, carbsG: 0, fatG: 0, proteinG: 0 },
    });
  });

  it("keeps one row of targets per account, the last save winning", async () => {
    await as(user, (tx) =>
      saveNutritionTargets(tx, user.id, {
        dailyKcal: 2400,
        proteinPerKg: 1.8,
        split: "body_weight",
      }),
    );
    await as(user, (tx) =>
      saveNutritionTargets(tx, user.id, {
        dailyKcal: 2500,
        proteinPerKg: 2.2,
        split: "body_weight",
      }),
    );
    const day = await as(user, (tx) => readFoodDay(tx, user.id, TODAY));
    expect(day.targets).toEqual({ dailyKcal: 2500, proteinPerKg: 2.2, split: "body_weight" });
  });

  it("refuses targets outside the bounds, where the data lives", async () => {
    expect(
      await failure(
        as(user, (tx) =>
          saveNutritionTargets(tx, user.id, {
            dailyKcal: 100,
            proteinPerKg: 1.8,
            split: "body_weight",
          }),
        ),
      ),
    ).toMatch(/nutrition_targets_values_chk/);
  });
});

describe("meals", () => {
  let snackId: string;

  it("logs a meal with its foods, in the order they were entered", async () => {
    snackId = await as(user, (tx) =>
      createMeal(tx, user.id, TODAY, {
        name: "Afternoon meal 1",
        items: [PEANUT_BUTTER, MILK],
        starred: false,
      }),
    );
    const screen = await as(user, (tx) => readFoodScreen(tx, user.id, TODAY));
    expect(screen.meals).toEqual([
      {
        id: snackId,
        name: "Afternoon meal 1",
        eatenOn: TODAY,
        savedMealId: null,
        items: [PEANUT_BUTTER, MILK],
        totals: { kcal: 601.5, carbsG: 27, fatG: 45.5, proteinG: 27.3 },
      },
    ]);
  });

  it("adds every meal of the day, and only that day, into its totals", async () => {
    await as(user, (tx) =>
      createMeal(tx, user.id, TODAY, { name: "Dinner out", items: [TAKEAWAY], starred: false }),
    );
    await as(user, (tx) =>
      createMeal(tx, user.id, YESTERDAY, { name: "Yesterday", items: [MILK], starred: false }),
    );
    const day = await as(user, (tx) => readFoodDay(tx, user.id, TODAY));
    // The takeaway's macronutrients were never given, so it adds energy and no grams.
    expect(day.eaten).toEqual({ kcal: 1501.5, carbsG: 27, fatG: 45.5, proteinG: 27.3 });
    const screen = await as(user, (tx) => readFoodScreen(tx, user.id, TODAY));
    expect(screen.meals.map((meal) => meal.name)).toEqual(["Afternoon meal 1", "Dinner out"]);
    expect(screen.meals.find((meal) => meal.name === "Dinner out")).toMatchObject({
      items: [TAKEAWAY],
      totals: { kcal: 900 },
    });
  });

  it("keeps an unnamed zero-kcal food editable instead of dropping the joined row", async () => {
    const item = { ...TAKEAWAY, kcal: 0 };
    const id = await as(user, (tx) =>
      createMeal(tx, user.id, TODAY, { name: "Zero", items: [item], starred: false }),
    );
    const screen = await as(user, (tx) => readFoodScreen(tx, user.id, TODAY));
    expect(screen.meals.find((meal) => meal.id === id)?.items).toEqual([item]);
    await as(user, (tx) => deleteMeal(tx, user.id, id));
  });

  it("rewrites a meal's name and foods on the day it was eaten", async () => {
    await as(user, (tx) =>
      updateMeal(tx, user.id, snackId, {
        name: "Peanut butter toast",
        items: [MILK, { ...PEANUT_BUTTER, kcal: 300 }],
        starred: false,
      }),
    );
    const screen = await as(user, (tx) => readFoodScreen(tx, user.id, TODAY));
    const snack = screen.meals.find((meal) => meal.id === snackId);
    expect(snack).toMatchObject({
      name: "Peanut butter toast",
      eatenOn: TODAY,
      items: [MILK, { ...PEANUT_BUTTER, kcal: 300 }],
    });
    // Still first: editing a meal does not move it down the day.
    expect(screen.meals[0]?.id).toBe(snackId);
  });

  it("deletes a meal together with its foods, and treats a second delete as done", async () => {
    const id = await as(user, (tx) =>
      createMeal(tx, user.id, TODAY, { name: "Mistake", items: [MILK], starred: false }),
    );
    expect(await as(user, (tx) => deleteMeal(tx, user.id, id))).toBe(true);
    expect(await as(user, (tx) => deleteMeal(tx, user.id, id))).toBe(false);
    const left = await t.db.select().from(mealItems).where(eq(mealItems.mealId, id));
    expect(left).toEqual([]);
  });

  it("refuses a food outside the bounds, where the data lives", async () => {
    expect(
      await failure(
        as(user, (tx) =>
          createMeal(tx, user.id, TODAY, {
            name: "Negative",
            items: [{ ...MILK, kcal: -5 }],
            starred: false,
          }),
        ),
      ),
    ).toMatch(/meal_items_values_chk/);
  });
});

describe("starred meals", () => {
  it("stars a copy of a meal when it is logged with the star on", async () => {
    const id = await as(user, (tx) =>
      createMeal(tx, user.id, TODAY, {
        name: "Protein shake",
        items: [MILK, { name: "Whey, 1 scoop", kcal: 120, carbsG: 3, fatG: 1.5, proteinG: 24 }],
        starred: true,
      }),
    );
    const screen = await as(user, (tx) => readFoodScreen(tx, user.id, TODAY));
    const shake = screen.meals.find((meal) => meal.id === id)!;
    expect(screen.savedMeals).toEqual([
      {
        id: shake.savedMealId,
        name: "Protein shake",
        items: shake.items,
        totals: shake.totals,
      },
    ]);
  });

  it("adds a starred meal to a day as a meal of its own, pointing back at the star", async () => {
    const [star] = (await as(user, (tx) => readFoodScreen(tx, user.id, TODAY))).savedMeals;
    const id = await as(user, (tx) => logSavedMeal(tx, user.id, star!.id, YESTERDAY));
    const yesterday = await as(user, (tx) => readFoodScreen(tx, user.id, YESTERDAY));
    expect(yesterday.meals.find((meal) => meal.id === id)).toMatchObject({
      name: "Protein shake",
      savedMealId: star!.id,
      items: star!.items,
    });
  });

  it("never changes the starred copy when a meal logged from it is edited or deleted", async () => {
    const [star] = (await as(user, (tx) => readFoodScreen(tx, user.id, TODAY))).savedMeals;
    const id = await as(user, (tx) => logSavedMeal(tx, user.id, star!.id, TODAY));
    await as(user, (tx) =>
      updateMeal(tx, user.id, id, { name: "Half a shake", items: [MILK], starred: true }),
    );
    await as(user, (tx) => deleteMeal(tx, user.id, id));
    const [after] = (await as(user, (tx) => readFoodScreen(tx, user.id, TODAY))).savedMeals;
    expect(after).toEqual(star);
  });

  it("stars an existing meal as it now stands", async () => {
    const id = await as(user, (tx) =>
      createMeal(tx, user.id, TODAY, { name: "Oats", items: [MILK], starred: false }),
    );
    await as(user, (tx) =>
      updateMeal(tx, user.id, id, { name: "Oats and milk", items: [MILK, MILK], starred: true }),
    );
    const screen = await as(user, (tx) => readFoodScreen(tx, user.id, TODAY));
    const oats = screen.savedMeals.find((meal) => meal.name === "Oats and milk");
    expect(oats?.items).toEqual([MILK, MILK]);
    expect(screen.meals.find((meal) => meal.id === id)?.savedMealId).toBe(oats?.id);
  });

  it("unstarring deletes the copy and takes the star off every meal that had it", async () => {
    const screen = await as(user, (tx) => readFoodScreen(tx, user.id, TODAY));
    const shake = screen.meals.find((meal) => meal.name === "Protein shake")!;
    const starId = shake.savedMealId!;
    await as(user, (tx) =>
      updateMeal(tx, user.id, shake.id, { name: shake.name, items: shake.items, starred: false }),
    );
    const today = await as(user, (tx) => readFoodScreen(tx, user.id, TODAY));
    const yesterday = await as(user, (tx) => readFoodScreen(tx, user.id, YESTERDAY));
    expect(today.savedMeals.map((meal) => meal.id)).not.toContain(starId);
    // Yesterday's shake was added from the star: it keeps its foods and loses only the star.
    const logged = yesterday.meals.find((meal) => meal.name === "Protein shake");
    expect(logged).toMatchObject({ savedMealId: null, items: shake.items });
    await expect(as(user, (tx) => logSavedMeal(tx, user.id, starId, TODAY))).rejects.toThrow(
      SavedMealNotFoundError,
    );
  });

  it("removes a starred meal directly, leaving the meals added from it", async () => {
    const [oats] = (await as(user, (tx) => readFoodScreen(tx, user.id, TODAY))).savedMeals;
    expect(await as(user, (tx) => deleteSavedMeal(tx, user.id, oats!.id))).toBe(true);
    const screen = await as(user, (tx) => readFoodScreen(tx, user.id, TODAY));
    expect(screen.savedMeals).toEqual([]);
    expect(screen.meals.find((meal) => meal.name === "Oats and milk")?.savedMealId).toBeNull();
  });
});

describe("another account", () => {
  it("sees none of it, and can change none of it", async () => {
    const mine = await as(user, (tx) => readFoodScreen(tx, user.id, TODAY));
    const mealId = mine.meals[0]!.id;
    const starId = await as(user, (tx) =>
      createMeal(tx, user.id, TODAY, { name: "Mine", items: [MILK], starred: true }).then(
        async (id) =>
          (await readFoodScreen(tx, user.id, TODAY)).meals.find((meal) => meal.id === id)!
            .savedMealId!,
      ),
    );

    // Row Level Security, not the user_id filter, is what stops it: ask for theirs directly.
    const seen = await as(other, (tx) => readFoodScreen(tx, user.id, TODAY));
    expect(seen).toEqual({ targets: null, meals: [], savedMeals: [] });
    expect((await as(other, (tx) => readFoodDay(tx, user.id, TODAY))).eaten.kcal).toBe(0);

    await expect(
      as(other, (tx) =>
        updateMeal(tx, user.id, mealId, { name: "x", items: [MILK], starred: false }),
      ),
    ).rejects.toThrow(MealNotFoundError);
    expect(await as(other, (tx) => deleteMeal(tx, user.id, mealId))).toBe(false);
    expect(await as(other, (tx) => deleteSavedMeal(tx, user.id, starId))).toBe(false);
    await expect(as(other, (tx) => logSavedMeal(tx, other.id, starId, TODAY))).rejects.toThrow(
      SavedMealNotFoundError,
    );
    expect((await as(user, (tx) => readFoodScreen(tx, user.id, TODAY))).meals[0]?.id).toBe(mealId);
  });

  it("cannot put a food into someone else's meal, or point a meal at their star", async () => {
    const mine = await as(user, (tx) => readFoodScreen(tx, user.id, TODAY));
    const mealId = mine.meals[0]!.id;
    const starId = mine.savedMeals[0]!.id;
    // Both rows would pass the owner policy, being the other account's own; the keys that name
    // the owner alongside the meal are what refuse them.
    expect(
      await failure(
        as(other, (tx) =>
          tx.insert(mealItems).values({ userId: other.id, mealId, position: 9, kcal: 1 }),
        ),
      ),
    ).toMatch(/meal_items_meal_fk/);
    expect(
      await failure(
        as(other, (tx) =>
          tx
            .insert(meals)
            .values({ userId: other.id, eatenOn: TODAY, name: "Theirs", savedMealId: starId }),
        ),
      ),
    ).toMatch(/meals_saved_meal_fk/);
  });

  it("goes with the account", async () => {
    await t.client.query("delete from auth.users where id = $1", [user.id]);
    const counts = await t.db.execute<{ meals: number; items: number; saved: number }>(sql`
      select (select count(*)::int from ${meals}) as meals,
             (select count(*)::int from ${mealItems}) as items,
             (select count(*)::int from ${savedMeals}) as saved
    `);
    expect(counts.rows[0]).toEqual({ meals: 0, items: 0, saved: 0 });
  });
});
