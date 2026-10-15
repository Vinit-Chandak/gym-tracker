import { readFile } from "node:fs/promises";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";

import { foodEntries, foods, savedMeals } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import type { LoggedFood, Meal } from "@/domain/nutrition";
import { ensureProfile } from "@/server/queries/profile";

/**
 * Migration 0048, against saved meals and entries from before it.
 *
 * Nothing recorded which meals came from a saved meal, so each starts from the meals of a day
 * that held exactly its foods. The rows are written as the previous deployment wrote them, the
 * new columns at their defaults, and the file is run as the migrator runs it, in one transaction;
 * then again, which changes nothing.
 */

let t: TestDatabase;
let userId = "";
const ids: Record<string, string> = {};

const portion = (name: string) =>
  ({ name, portionAmount: 1, unit: "serving", kcal: 100, carbsG: null, fatG: null, proteinG: null }) as const;

async function runMigration(): Promise<void> {
  const file = await readFile("src/db/migrations/0048_most_eaten_first.sql", "utf8");
  await t.client.exec("BEGIN");
  try {
    for (const statement of file.split("--> statement-breakpoint")) {
      await t.client.exec(statement.trim());
    }
    await t.client.exec("COMMIT");
  } catch (error) {
    await t.client.exec("ROLLBACK");
    throw error;
  }
}

async function counted() {
  const rows = await t.db
    .select({
      name: savedMeals.name,
      times: savedMeals.timesLogged,
      last: savedMeals.lastLoggedAt,
    })
    .from(savedMeals)
    .where(eq(savedMeals.userId, userId));
  return Object.fromEntries(rows.map((row) => [row.name, { times: row.times, last: row.last }]));
}

beforeAll(async () => {
  t = await createTestDatabase();
  const user = await t.createAuthUser("habit@example.test");
  const other = await t.createAuthUser("neighbour@example.test");
  for (const account of [user, other]) {
    await withUser(t.db, account.id, (tx) => ensureProfile(tx, account));
  }
  userId = user.id;
  for (const name of ["Oats", "Milk", "Whey", "Gone"]) {
    const [row] = await t.db
      .insert(foods)
      .values({ userId, ...portion(name) })
      .returning({ id: foods.id });
    ids[name] = row!.id;
  }
  const [theirs] = await t.db
    .insert(foods)
    .values({ userId: other.id, ...portion("Oats") })
    .returning({ id: foods.id });

  const entry = (eatenOn: string, meal: Meal, name: string, foodId: string | null, amount = 1) => ({
    userId,
    eatenOn,
    meal,
    foodId,
    ...portion(name),
    amount,
  });
  await t.db.insert(foodEntries).values([
    // Oats and milk as saved, three breakfasts: at any amounts, and a quick add beside them.
    entry("2026-09-01", "breakfast", "Oats", ids.Oats!),
    entry("2026-09-01", "breakfast", "Milk", ids.Milk!),
    entry("2026-09-02", "breakfast", "Oats", ids.Oats!, 2.5),
    entry("2026-09-02", "breakfast", "Milk", ids.Milk!),
    entry("2026-09-03", "breakfast", "Oats", ids.Oats!),
    entry("2026-09-03", "breakfast", "Milk", ids.Milk!),
    entry("2026-09-03", "breakfast", "Coffee", null),
    // With whey as well, it was another meal.
    entry("2026-09-04", "breakfast", "Oats", ids.Oats!),
    entry("2026-09-04", "breakfast", "Milk", ids.Milk!),
    entry("2026-09-04", "breakfast", "Whey", ids.Whey!),
    // Oats alone, at lunch.
    entry("2026-09-04", "lunch", "Oats", ids.Oats!),
    // A food deleted since: its entries keep their copy and lose the link.
    entry("2026-09-05", "dinner", "Gone", ids.Gone!),
    // The neighbour's oats count for nobody here.
    { ...entry("2026-09-05", "lunch", "Oats", theirs!.id), userId: other.id },
  ]);

  const item = (name: string, foodId: string): LoggedFood => ({ ...portion(name), foodId, amount: 1 });
  await t.db.insert(savedMeals).values([
    { userId, name: "Oats and milk", items: [item("Oats", ids.Oats!), item("Milk", ids.Milk!)] },
    { userId, name: "Plain oats", items: [item("Oats", ids.Oats!), item("Oats", ids.Oats!)] },
    { userId, name: "Whey and milk", items: [item("Whey", ids.Whey!), item("Milk", ids.Milk!)] },
    { userId, name: "Gone meal", items: [item("Gone", ids.Gone!)] },
    { userId, name: "Counted already", items: [item("Oats", ids.Oats!)], timesLogged: 5 },
    // Saved the old way: a name and nothing that links it to My foods.
    { userId, name: "Old way", items: [{ name: "Oats" } as unknown as LoggedFood] },
  ]);
  await t.db.delete(foods).where(eq(foods.id, ids.Gone!));
  await runMigration();
});

afterAll(async () => {
  await t.close();
});

it("counts each meal of a day that held exactly a saved meal's foods", async () => {
  const meals = await counted();
  expect(meals["Oats and milk"]!.times).toBe(3);
  // The same food twice in a saved meal is still the one food.
  expect(meals["Plain oats"]!.times).toBe(1);
  expect(meals["Oats and milk"]!.last).toBeInstanceOf(Date);
});

it("counts nothing that was not eaten as saved, or cannot be linked", async () => {
  const meals = await counted();
  expect(meals["Whey and milk"]).toEqual({ times: 0, last: null });
  expect(meals["Gone meal"]).toEqual({ times: 0, last: null });
  expect(meals["Old way"]).toEqual({ times: 0, last: null });
});

it("leaves a meal already counted as it was", async () => {
  expect((await counted())["Counted already"]).toEqual({ times: 5, last: null });
});

it("changes nothing when it runs again", async () => {
  const before = await counted();
  await runMigration();
  expect(await counted()).toEqual(before);
});
