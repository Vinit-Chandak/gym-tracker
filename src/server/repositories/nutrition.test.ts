import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { foodEntries, foods, savedMeals } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { eaten, sameFoods, type Food, type Meal } from "@/domain/nutrition";
import { ensureProfile } from "@/server/queries/profile";

import {
  AmountTooLargeError,
  createFood,
  deleteEntry,
  deleteFood,
  deleteSavedMeal,
  EmptyMealError,
  EntryNotFoundError,
  FoodNameTakenError,
  FoodNotFoundError,
  logFood,
  logSavedMeal,
  readFoodDay,
  readLibrary,
  readMealScreen,
  readSavedMeal,
  readTargets,
  SavedMealChangedError,
  SavedMealNameTakenError,
  SavedMealNotFoundError,
  SavedMealTooLargeError,
  saveLibraryMeal,
  saveMeal,
  saveNutritionTargets,
  submitFoodOnce,
  updateEntryAmount,
  updateFood,
} from "./nutrition";

let t: TestDatabase;
let user: { id: string; email: string };
let other: { id: string; email: string };

const TODAY = "2026-09-25";
const YESTERDAY = "2026-09-24";
const at = (meal: Meal, eatenOn = TODAY) => ({ eatenOn, meal });

const OATS: Food = {
  name: "Oats",
  portionAmount: 100,
  unit: "g",
  kcal: 389,
  carbsG: 66.3,
  fatG: 6.9,
  proteinG: 16.9,
};
const MILK: Food = {
  name: "Milk",
  portionAmount: 250,
  unit: "ml",
  kcal: 160,
  carbsG: 12,
  fatG: 8,
  proteinG: 8.5,
};
/** A guessed takeaway: one serving, its energy and nothing else. */
const TAKEAWAY: Food = {
  name: "Thai takeaway",
  portionAmount: 1,
  unit: "serving",
  kcal: 900,
  carbsG: null,
  fatG: null,
  proteinG: null,
};

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

const foodId = async (account: { id: string }, name: string) =>
  (await as(account, (tx) => readMealScreen(tx, account.id, at("breakfast")))).foods.find(
    (food) => food.name === name,
  )!.id;

beforeAll(async () => {
  t = await createTestDatabase();
  user = await t.createAuthUser("eater@example.test");
  other = await t.createAuthUser("other-eater@example.test");
  for (const account of [user, other]) {
    await withUser(t.db, account.id, (tx) => ensureProfile(tx, account));
  }
});

afterAll(async () => {
  await t.close();
});

describe("targets", () => {
  it("reads nothing set and nothing eaten as exactly that", async () => {
    expect(await as(user, (tx) => readFoodDay(tx, user.id, TODAY))).toEqual({
      targets: null,
      entries: [],
      eaten: { kcal: 0, carbsG: 0, fatG: 0, proteinG: 0 },
      library: { foods: 0, meals: 0 },
    });
    expect(await as(user, (tx) => readTargets(tx, user.id))).toBeNull();
  });

  it("keeps one row of targets per account, the last save winning", async () => {
    for (const [dailyKcal, proteinPerKg, fatPercent] of [
      [2400, 1.8, 25],
      [2500, 2.2, 30],
    ] as const) {
      await as(user, (tx) =>
        saveNutritionTargets(tx, user.id, { dailyKcal, proteinPerKg, fatPercent }),
      );
    }
    const day = await as(user, (tx) => readFoodDay(tx, user.id, TODAY));
    expect(day.targets).toEqual({ dailyKcal: 2500, proteinPerKg: 2.2, fatPercent: 30 });
    expect(await as(user, (tx) => readTargets(tx, user.id))).toEqual(day.targets);
  });

  it("refuses targets outside the bounds, where the data lives", async () => {
    for (const targets of [
      { dailyKcal: 100, proteinPerKg: 1.8, fatPercent: 25 },
      { dailyKcal: 2400, proteinPerKg: 1.8, fatPercent: 90 },
    ]) {
      expect(await failure(as(user, (tx) => saveNutritionTargets(tx, user.id, targets)))).toMatch(
        /nutrition_targets_values_chk/,
      );
    }
  });
});

describe("logging a food", () => {
  it("saves a new food to My foods by logging it, at whatever amount was eaten", async () => {
    await as(user, (tx) => logFood(tx, user.id, at("breakfast"), { food: OATS, amount: 60 }));
    const screen = await as(user, (tx) => readMealScreen(tx, user.id, at("breakfast")));
    expect(screen.foods).toEqual([{ id: expect.any(String), ...OATS }]);
    expect(screen.entries).toEqual([
      {
        id: expect.any(String),
        eatenOn: TODAY,
        meal: "breakfast",
        foodId: screen.foods[0]!.id,
        ...OATS,
        amount: 60,
      },
    ]);
    // 60 g of a food saved per 100 g.
    expect((await as(user, (tx) => readFoodDay(tx, user.id, TODAY))).eaten).toEqual({
      kcal: 233.4,
      carbsG: 39.8,
      fatG: 4.1,
      proteinG: 10.1,
    });
  });

  it("logs a saved food at another amount, the food itself unchanged", async () => {
    const id = await foodId(user, "Oats");
    await as(user, (tx) => logFood(tx, user.id, at("lunch"), { food: { id }, amount: 200 }));
    const lunch = await as(user, (tx) => readMealScreen(tx, user.id, at("lunch")));
    expect(lunch.entries.map(eaten)).toEqual([
      { kcal: 778, carbsG: 132.6, fatG: 13.8, proteinG: 33.8 },
    ]);
    expect(lunch.foods.find((food) => food.id === id)).toEqual({ id, ...OATS });
    // Each meal holds only its own.
    expect(
      (await as(user, (tx) => readMealScreen(tx, user.id, at("breakfast")))).entries,
    ).toHaveLength(1);
  });

  it("adds every meal of the day, and only that day, into its totals", async () => {
    await as(user, (tx) => logFood(tx, user.id, at("dinner"), { food: TAKEAWAY, amount: 1 }));
    await as(user, (tx) =>
      logFood(tx, user.id, at("dinner", YESTERDAY), { food: MILK, amount: 500 }),
    );
    const day = await as(user, (tx) => readFoodDay(tx, user.id, TODAY));
    expect(day.entries.map((entry) => [entry.meal, entry.name])).toEqual([
      ["breakfast", "Oats"],
      ["lunch", "Oats"],
      ["dinner", "Thai takeaway"],
    ]);
    // The takeaway's macronutrients were never given: energy, and no grams.
    expect(day.eaten).toEqual({ kcal: 1911.4, carbsG: 172.4, fatG: 17.9, proteinG: 43.9 });
  });

  it("lists My foods with the most lately eaten first", async () => {
    const milk = await foodId(user, "Milk");
    const names = async () =>
      (await as(user, (tx) => readMealScreen(tx, user.id, at("breakfast")))).foods.map(
        (food) => food.name,
      );
    const oats = await foodId(user, "Oats");
    expect(await names()).toEqual(["Milk", "Thai takeaway", "Oats"]);
    await as(user, (tx) =>
      logFood(tx, user.id, at("breakfast"), { food: { id: oats }, amount: 1 }),
    );
    expect(await names()).toEqual(["Oats", "Milk", "Thai takeaway"]);
    await as(user, (tx) =>
      logFood(tx, user.id, at("evening_snack"), { food: { id: milk }, amount: 1 }),
    );
    expect(await names()).toEqual(["Milk", "Oats", "Thai takeaway"]);
  });

  it("refuses a second food of the same name, whatever its capitals", async () => {
    await expect(
      as(user, (tx) =>
        logFood(tx, user.id, at("breakfast"), { food: { ...MILK, name: "MILK" }, amount: 1 }),
      ),
    ).rejects.toThrow(FoodNameTakenError);
    // Even when two requests race past the check, the database says the same.
    expect(
      await failure(
        as(user, (tx) => tx.insert(foods).values({ userId: user.id, ...MILK, name: "milk" })),
      ),
    ).toMatch(/foods_owner_name_uq/);
  });

  it("refuses an amount that comes to more than one food can, and writes nothing", async () => {
    const before = (await as(user, (tx) => readFoodDay(tx, user.id, TODAY))).entries.length;
    await expect(
      as(user, (tx) =>
        logFood(tx, user.id, at("lunch"), { food: { ...OATS, name: "Oat flour" }, amount: 5000 }),
      ),
    ).rejects.toThrow(AmountTooLargeError);
    const oats = await foodId(user, "Oats");
    await expect(
      as(user, (tx) => logFood(tx, user.id, at("lunch"), { food: { id: oats }, amount: 5000 })),
    ).rejects.toThrow("That comes to more than 10,000 kcal.");
    expect((await as(user, (tx) => readFoodDay(tx, user.id, TODAY))).entries).toHaveLength(before);
    const names = (await as(user, (tx) => readMealScreen(tx, user.id, at("lunch")))).foods;
    expect(names.map((food) => food.name)).not.toContain("Oat flour");
  });

  it("refuses a food that is not the account's, and figures outside the bounds", async () => {
    await expect(
      as(user, (tx) =>
        logFood(tx, user.id, at("lunch"), { food: { id: crypto.randomUUID() }, amount: 1 }),
      ),
    ).rejects.toThrow(FoodNotFoundError);
    expect(
      await failure(
        as(user, (tx) =>
          logFood(tx, user.id, at("lunch"), {
            food: { ...OATS, name: "Negative", kcal: -5 },
            amount: 1,
          }),
        ),
      ),
    ).toMatch(/foods_values_chk/);
    expect(
      await failure(
        as(user, (tx) =>
          logFood(tx, user.id, at("lunch"), {
            food: { ...OATS, name: "Cups", unit: "bucket" as Food["unit"] },
            amount: 1,
          }),
        ),
      ),
    ).toMatch(/foods_values_chk/);
  });
});

describe("changing what was eaten", () => {
  it("rescales an entry from its own copy, exactly, however often it changes", async () => {
    const [entry] = (await as(user, (tx) => readMealScreen(tx, user.id, at("lunch")))).entries;
    const lunch = async () =>
      (await as(user, (tx) => readMealScreen(tx, user.id, at("lunch")))).entries.map(eaten);
    for (const amount of [33, 150, 7.5]) {
      await as(user, (tx) => updateEntryAmount(tx, user.id, entry!.id, amount));
    }
    await as(user, (tx) => updateEntryAmount(tx, user.id, entry!.id, 200));
    expect(await lunch()).toEqual([{ kcal: 778, carbsG: 132.6, fatG: 13.8, proteinG: 33.8 }]);
    await as(user, (tx) => updateEntryAmount(tx, user.id, entry!.id, 100));
    expect(await lunch()).toEqual([{ kcal: 389, carbsG: 66.3, fatG: 6.9, proteinG: 16.9 }]);
  });

  it("refuses too much, and an entry that is gone", async () => {
    const [entry] = (await as(user, (tx) => readMealScreen(tx, user.id, at("lunch")))).entries;
    await expect(as(user, (tx) => updateEntryAmount(tx, user.id, entry!.id, 9000))).rejects.toThrow(
      AmountTooLargeError,
    );
    await expect(
      as(user, (tx) => updateEntryAmount(tx, user.id, crypto.randomUUID(), 10)),
    ).rejects.toThrow(EntryNotFoundError);
  });

  it("takes a food out of a meal, and treats a second removal as done", async () => {
    const id = await as(user, (tx) =>
      logFood(tx, user.id, at("morning_snack"), {
        food: { ...TAKEAWAY, name: "Biscuit" },
        amount: 2,
      }),
    );
    expect(await as(user, (tx) => deleteEntry(tx, user.id, id))).toBe(true);
    expect(await as(user, (tx) => deleteEntry(tx, user.id, id))).toBe(false);
    expect(
      (await as(user, (tx) => readMealScreen(tx, user.id, at("morning_snack")))).entries,
    ).toEqual([]);
  });
});

describe("correcting My foods", () => {
  it("changes what is logged from now on, never what was already eaten", async () => {
    const id = await foodId(user, "Oats");
    const before = await as(user, (tx) => readFoodDay(tx, user.id, TODAY));
    await as(user, (tx) =>
      updateFood(tx, user.id, id, { ...OATS, name: "Rolled oats", kcal: 379, carbsG: 60 }),
    );
    expect(await as(user, (tx) => readFoodDay(tx, user.id, TODAY))).toEqual(before);
    await as(user, (tx) =>
      logFood(tx, user.id, at("afternoon_snack"), { food: { id }, amount: 50 }),
    );
    const snack = await as(user, (tx) => readMealScreen(tx, user.id, at("afternoon_snack")));
    expect(snack.entries.map((entry) => [entry.name, eaten(entry).kcal])).toEqual([
      ["Rolled oats", 189.5],
    ]);
  });

  it("refuses another food's name, and a food that is gone", async () => {
    const id = await foodId(user, "Rolled oats");
    await expect(
      as(user, (tx) => updateFood(tx, user.id, id, { ...OATS, name: "milk" })),
    ).rejects.toThrow("You already have a food called milk.");
    // Its own name in other capitals is no clash.
    await as(user, (tx) => updateFood(tx, user.id, id, { ...OATS, name: "Rolled Oats" }));
    await expect(
      as(user, (tx) => updateFood(tx, user.id, crypto.randomUUID(), OATS)),
    ).rejects.toThrow(FoodNotFoundError);
  });

  it("deletes a food and keeps every entry logged from it, unlinked", async () => {
    const id = await foodId(user, "Thai takeaway");
    expect(await as(user, (tx) => deleteFood(tx, user.id, id))).toBe(true);
    expect(await as(user, (tx) => deleteFood(tx, user.id, id))).toBe(false);
    const dinner = await as(user, (tx) => readMealScreen(tx, user.id, at("dinner")));
    expect(dinner.entries).toMatchObject([{ name: "Thai takeaway", foodId: null, kcal: 900 }]);
    expect(dinner.foods.map((food) => food.name)).not.toContain("Thai takeaway");
  });
});

describe("saved meals", () => {
  it("saves a meal as it stands, with each food's amount", async () => {
    await as(user, (tx) => saveMeal(tx, user.id, at("breakfast"), "Usual breakfast"));
    const screen = await as(user, (tx) => readMealScreen(tx, user.id, at("breakfast")));
    expect(screen.savedMeals).toEqual([
      {
        id: expect.any(String),
        name: "Usual breakfast",
        items: screen.entries.map(({ id: _id, eatenOn: _day, meal: _meal, ...food }) => food),
      },
    ]);
    expect(sameFoods(screen.entries, screen.savedMeals[0]!.items)).toBe(true);
  });

  it("adds a saved meal to another meal and day, exactly as saved", async () => {
    const [saved] = (await as(user, (tx) => readMealScreen(tx, user.id, at("breakfast"))))
      .savedMeals;
    await as(user, (tx) => logSavedMeal(tx, user.id, saved!.id, at("breakfast", YESTERDAY)));
    const yesterday = await as(user, (tx) =>
      readMealScreen(tx, user.id, at("breakfast", YESTERDAY)),
    );
    expect(sameFoods(yesterday.entries, saved!.items)).toBe(true);
    // In the order they were saved.
    expect(yesterday.entries.map((entry) => entry.amount)).toEqual(
      saved!.items.map((item) => item.amount),
    );
  });

  it("saves again under the same name, whatever its capitals, rather than twice", async () => {
    const milk = await foodId(user, "Milk");
    await as(user, (tx) =>
      logFood(tx, user.id, at("breakfast"), { food: { id: milk }, amount: 300 }),
    );
    await as(user, (tx) => saveMeal(tx, user.id, at("breakfast"), "usual BREAKFAST"));
    const screen = await as(user, (tx) => readMealScreen(tx, user.id, at("breakfast")));
    expect(screen.savedMeals).toHaveLength(1);
    expect(screen.savedMeals[0]).toMatchObject({ name: "usual BREAKFAST" });
    expect(sameFoods(screen.entries, screen.savedMeals[0]!.items)).toBe(true);
  });

  it("keeps what it saved when its foods are corrected or deleted", async () => {
    const [saved] = (await as(user, (tx) => readMealScreen(tx, user.id, at("breakfast"))))
      .savedMeals;
    const milk = await foodId(user, "Milk");
    await as(user, (tx) => deleteFood(tx, user.id, milk));
    await as(user, (tx) => logSavedMeal(tx, user.id, saved!.id, at("dinner", YESTERDAY)));
    const dinner = await as(user, (tx) => readMealScreen(tx, user.id, at("dinner", YESTERDAY)));
    const milkEntry = dinner.entries.find((entry) => entry.name === "Milk" && entry.amount === 300);
    expect(milkEntry).toMatchObject({ foodId: null, kcal: 160, portionAmount: 250 });
    expect(dinner.savedMeals[0]!.items).toEqual(saved!.items);
  });

  it("refuses to save a meal with nothing in it, or more than a saved meal holds", async () => {
    await expect(
      as(user, (tx) => saveMeal(tx, user.id, at("morning_snack"), "Nothing")),
    ).rejects.toThrow(EmptyMealError);
    for (let i = 0; i < 31; i++) {
      await as(user, (tx) =>
        tx.insert(foodEntries).values({
          userId: user.id,
          eatenOn: "2026-09-01",
          meal: "lunch",
          name: `Crumb ${i}`,
          portionAmount: 1,
          unit: "piece",
          kcal: 1,
          amount: 1,
        }),
      );
    }
    await expect(
      as(user, (tx) => saveMeal(tx, user.id, at("lunch", "2026-09-01"), "Crumbs")),
    ).rejects.toThrow(SavedMealTooLargeError);
  });

  it("reads a saved meal written the old way as one serving of each food", async () => {
    const [legacy] = await as(user, (tx) =>
      tx
        .insert(savedMeals)
        .values({
          userId: user.id,
          name: "Old shake",
          items: [{ name: null, kcal: 280, carbsG: 15, fatG: null, proteinG: 32.5 }] as never,
        })
        .returning({ id: savedMeals.id }),
    );
    await as(user, (tx) => logSavedMeal(tx, user.id, legacy!.id, at("evening_snack")));
    const snack = await as(user, (tx) => readMealScreen(tx, user.id, at("evening_snack")));
    expect(snack.entries.at(-1)).toMatchObject({
      name: "Old shake",
      portionAmount: 1,
      unit: "serving",
      amount: 1,
      kcal: 280,
      foodId: null,
    });
    await as(user, (tx) => deleteSavedMeal(tx, user.id, legacy!.id));
  });

  it("deletes a saved meal, leaving the meals it was added to", async () => {
    const [saved] = (await as(user, (tx) => readMealScreen(tx, user.id, at("breakfast"))))
      .savedMeals;
    expect(await as(user, (tx) => deleteSavedMeal(tx, user.id, saved!.id))).toBe(true);
    expect(await as(user, (tx) => deleteSavedMeal(tx, user.id, saved!.id))).toBe(false);
    await expect(
      as(user, (tx) => logSavedMeal(tx, user.id, saved!.id, at("lunch"))),
    ).rejects.toThrow(SavedMealNotFoundError);
    expect(
      (await as(user, (tx) => readMealScreen(tx, user.id, at("breakfast", YESTERDAY)))).entries
        .length,
    ).toBeGreaterThan(0);
  });
});

describe("My foods", () => {
  const PANEER: Food = {
    name: "Paneer",
    portionAmount: 100,
    unit: "g",
    kcal: 265,
    carbsG: 1.2,
    fatG: 20.8,
    proteinG: 18.3,
  };
  const RICE: Food = {
    name: "Rice",
    portionAmount: 100,
    unit: "g",
    kcal: 130,
    carbsG: 28,
    fatG: 0.3,
    proteinG: 2.7,
  };

  it("keeps a food without logging any of it, near the top of the list", async () => {
    const before = await as(user, (tx) => readFoodDay(tx, user.id, TODAY));
    const id = await as(user, (tx) => createFood(tx, user.id, PANEER));
    const library = await as(user, (tx) => readLibrary(tx, user.id));
    expect(library.foods[0]).toEqual({ id, ...PANEER });
    const after = await as(user, (tx) => readFoodDay(tx, user.id, TODAY));
    expect(after.entries).toEqual(before.entries);
    expect(after.library.foods).toBe(before.library.foods + 1);
    await expect(
      as(user, (tx) => createFood(tx, user.id, { ...PANEER, name: "PANEER" })),
    ).rejects.toThrow(FoodNameTakenError);
  });

  it("builds a meal from My foods, each food copied at its amount", async () => {
    const paneer = await foodId(user, "Paneer");
    await as(user, (tx) => createFood(tx, user.id, RICE));
    const rice = await foodId(user, "Rice");
    const id = await as(user, (tx) =>
      saveLibraryMeal(tx, user.id, {
        name: "Paneer rice",
        items: [
          { foodId: rice, amount: 200 },
          { foodId: paneer, amount: 150 },
        ],
      }),
    );
    const saved = await as(user, (tx) => readSavedMeal(tx, user.id, id));
    expect(saved).toEqual({
      id,
      name: "Paneer rice",
      items: [
        { ...RICE, foodId: rice, amount: 200 },
        { ...PANEER, foodId: paneer, amount: 150 },
      ],
    });
    const day = await as(user, (tx) => readFoodDay(tx, user.id, TODAY));
    expect(day.library.meals).toBeGreaterThan(0);
  });

  it("keeps the copies a meal already holds when it is changed, and copies what is added", async () => {
    const [meal] = (await as(user, (tx) => readLibrary(tx, user.id))).savedMeals.filter(
      (saved) => saved.name === "Paneer rice",
    );
    const paneer = await foodId(user, "Paneer");
    // Paneer is corrected after the meal was saved: the meal keeps the paneer it held.
    await as(user, (tx) => updateFood(tx, user.id, paneer, { ...PANEER, kcal: 300 }));
    await as(user, (tx) =>
      saveLibraryMeal(tx, user.id, {
        id: meal!.id,
        name: "Paneer rice bowl",
        items: [
          { keep: 1, amount: 100 },
          { foodId: paneer, amount: 50 },
        ],
      }),
    );
    const saved = await as(user, (tx) => readSavedMeal(tx, user.id, meal!.id));
    expect(saved?.name).toBe("Paneer rice bowl");
    expect(saved?.items.map((item) => [item.name, item.kcal, item.amount])).toEqual([
      ["Paneer", 265, 100],
      ["Paneer", 300, 50],
    ]);
  });

  it("refuses another meal's name, a food or a kept item that is gone, and nothing at all", async () => {
    const rice = await foodId(user, "Rice");
    const [meal] = (await as(user, (tx) => readLibrary(tx, user.id))).savedMeals.filter(
      (saved) => saved.name === "Paneer rice bowl",
    );
    await as(user, (tx) =>
      saveLibraryMeal(tx, user.id, { name: "Plain rice", items: [{ foodId: rice, amount: 150 }] }),
    );
    await expect(
      as(user, (tx) =>
        saveLibraryMeal(tx, user.id, {
          id: meal!.id,
          name: "PLAIN RICE",
          items: [{ keep: 0, amount: 1 }],
        }),
      ),
    ).rejects.toThrow(SavedMealNameTakenError);
    await expect(
      as(user, (tx) =>
        saveLibraryMeal(tx, user.id, {
          id: meal!.id,
          name: "Bowl",
          items: [{ keep: 9, amount: 1 }],
        }),
      ),
    ).rejects.toThrow(SavedMealChangedError);
    await expect(
      as(user, (tx) =>
        saveLibraryMeal(tx, user.id, {
          name: "Ghost",
          items: [{ foodId: "00000000-0000-4000-8000-000000000000", amount: 1 }],
        }),
      ),
    ).rejects.toThrow(FoodNotFoundError);
    await expect(
      as(user, (tx) => saveLibraryMeal(tx, user.id, { name: "Empty", items: [] })),
    ).rejects.toThrow(EmptyMealError);
    await expect(
      as(user, (tx) =>
        saveLibraryMeal(tx, user.id, { name: "Heap", items: [{ foodId: rice, amount: 9000 }] }),
      ),
    ).rejects.toThrow(AmountTooLargeError);
  });

  it("is the account's own: another reads none of it and can change none of it", async () => {
    const [meal] = (await as(user, (tx) => readLibrary(tx, user.id))).savedMeals;
    expect(await as(other, (tx) => readSavedMeal(tx, user.id, meal!.id))).toBeNull();
    expect(await as(other, (tx) => readLibrary(tx, user.id))).toEqual({
      foods: [],
      savedMeals: [],
    });
    await expect(
      as(other, (tx) =>
        saveLibraryMeal(tx, other.id, {
          id: meal!.id,
          name: "Mine",
          items: [{ keep: 0, amount: 1 }],
        }),
      ),
    ).rejects.toThrow(SavedMealNotFoundError);
    const rice = await foodId(user, "Rice");
    await expect(
      as(other, (tx) =>
        saveLibraryMeal(tx, other.id, { name: "Borrowed", items: [{ foodId: rice, amount: 1 }] }),
      ),
    ).rejects.toThrow(FoodNotFoundError);
  });
});

describe("a retried save", () => {
  it("logs once, even after the entry it made was removed", async () => {
    const key = crypto.randomUUID();
    const input = { food: { ...OATS, name: "Receipt oats" }, amount: 40 };
    const save = () =>
      as(user, (tx) =>
        submitFoodOnce(tx, user.id, key, input, () =>
          logFood(tx, user.id, at("afternoon_snack"), input),
        ),
      );
    const count = async () =>
      (await as(user, (tx) => readMealScreen(tx, user.id, at("afternoon_snack")))).entries.filter(
        (entry) => entry.name === "Receipt oats",
      );
    await save();
    await save();
    const [logged] = await count();
    expect(await count()).toHaveLength(1);
    await expect(
      as(user, (tx) =>
        submitFoodOnce(tx, user.id, key, { ...input, amount: 41 }, () =>
          logFood(tx, user.id, at("afternoon_snack"), input),
        ),
      ),
    ).rejects.toThrow(/already saved/);
    await as(user, (tx) => deleteEntry(tx, user.id, logged!.id));
    await save();
    expect(await count()).toHaveLength(0);
  });

  it("rolls the receipt back with a failed write, and scopes keys to the account", async () => {
    const key = crypto.randomUUID();
    const input = { food: { ...MILK, name: "Retried milk" }, amount: 250 };
    await expect(
      as(user, (tx) =>
        submitFoodOnce(tx, user.id, key, input, async () => {
          throw new Error("write failed");
        }),
      ),
    ).rejects.toThrow("write failed");
    for (const account of [user, other]) {
      await as(account, (tx) =>
        submitFoodOnce(tx, account.id, key, input, () =>
          logFood(tx, account.id, at("dinner"), input),
        ),
      );
      const dinner = await as(account, (tx) => readMealScreen(tx, account.id, at("dinner")));
      expect(dinner.entries.filter((entry) => entry.name === "Retried milk")).toHaveLength(1);
    }
  });
});

describe("another account", () => {
  it("sees none of it, and can change none of it", async () => {
    const mine = await as(user, (tx) => readMealScreen(tx, user.id, at("breakfast")));
    const entryId = mine.entries[0]!.id;
    const oats = mine.foods.find((food) => food.name === "Rolled Oats")!;
    await as(user, (tx) => saveMeal(tx, user.id, at("breakfast"), "Mine"));
    const [star] = (await as(user, (tx) => readMealScreen(tx, user.id, at("breakfast"))))
      .savedMeals;

    // Row Level Security, not the user_id filter, is what stops it: ask for theirs directly.
    expect(await as(other, (tx) => readMealScreen(tx, user.id, at("breakfast")))).toEqual({
      entries: [],
      foods: [],
      savedMeals: [],
    });
    expect((await as(other, (tx) => readFoodDay(tx, user.id, TODAY))).entries).toEqual([]);

    await expect(as(other, (tx) => updateEntryAmount(tx, user.id, entryId, 1))).rejects.toThrow(
      EntryNotFoundError,
    );
    expect(await as(other, (tx) => deleteEntry(tx, user.id, entryId))).toBe(false);
    await expect(
      as(other, (tx) => updateFood(tx, user.id, oats.id, { ...OATS, name: "Theirs now" })),
    ).rejects.toThrow(FoodNotFoundError);
    expect(await as(other, (tx) => deleteFood(tx, user.id, oats.id))).toBe(false);
    expect(await as(other, (tx) => deleteSavedMeal(tx, user.id, star!.id))).toBe(false);
    await expect(
      as(other, (tx) => logFood(tx, other.id, at("lunch"), { food: { id: oats.id }, amount: 1 })),
    ).rejects.toThrow(FoodNotFoundError);
    await expect(
      as(other, (tx) => logSavedMeal(tx, other.id, star!.id, at("lunch"))),
    ).rejects.toThrow(SavedMealNotFoundError);
    // A name is only taken within one account.
    await as(other, (tx) =>
      logFood(tx, other.id, at("lunch"), { food: { ...OATS, name: "Rolled Oats" }, amount: 1 }),
    );
    expect(
      (await as(user, (tx) => readMealScreen(tx, user.id, at("breakfast")))).entries[0]?.id,
    ).toBe(entryId);
  });

  it("cannot log someone else's food against their own meal", async () => {
    const [theirs] = await t.db
      .select({ id: foods.id })
      .from(foods)
      .where(and(eq(foods.userId, user.id), eq(foods.name, "Rolled Oats")));
    // The row would pass the owner policy, being the other account's own; the key that names
    // the owner alongside the food is what refuses it.
    expect(
      await failure(
        as(other, (tx) =>
          tx.insert(foodEntries).values({
            userId: other.id,
            eatenOn: TODAY,
            meal: "lunch",
            foodId: theirs!.id,
            ...OATS,
            amount: 1,
          }),
        ),
      ),
    ).toMatch(/food_entries_food_fk/);
  });

  it("goes with the account", async () => {
    await t.client.query("delete from auth.users where id = $1", [user.id]);
    const counts = await t.db.execute<{ foods: number; entries: number; saved: number }>(sql`
      select (select count(*)::int from ${foods} where user_id = ${user.id}) as foods,
             (select count(*)::int from ${foodEntries} where user_id = ${user.id}) as entries,
             (select count(*)::int from ${savedMeals} where user_id = ${user.id}) as saved
    `);
    expect(counts.rows[0]).toEqual({ foods: 0, entries: 0, saved: 0 });
  });
});
