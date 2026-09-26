import { readFile } from "node:fs/promises";

import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";

import { foodEntries, foods, legacyMealItems, legacyMeals, profiles, savedMeals } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { ensureProfile } from "@/server/queries/profile";

/**
 * Migration 0041, against meals written before it.
 *
 * Every test database migrates a fresh schema, where the copy in 0041 finds nothing. So the old
 * meals are written afterwards, the way the previous deployment wrote them, and the file is run
 * again the way the migrator runs it: in one transaction. Running it a third time must change
 * nothing, which is what makes it safe to replay.
 */

let t: TestDatabase;
let india: string;
let nowhere: string;

async function runMigration(): Promise<void> {
  const file = await readFile("src/db/migrations/0041_meals_of_the_day_and_my_foods.sql", "utf8");
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

type Item = {
  name: string | null;
  kcal: number;
  carbsG?: number | null;
  fatG?: number | null;
  proteinG?: number | null;
};

/** An old meal, logged at `at`, with its foods in order. */
async function oldMeal(
  userId: string,
  name: string,
  at: string,
  items: Item[],
  eatenOn = "2026-09-24",
): Promise<void> {
  const createdAt = new Date(at);
  const [meal] = await t.db
    .insert(legacyMeals)
    .values({ userId, eatenOn, name, createdAt, updatedAt: createdAt })
    .returning({ id: legacyMeals.id });
  await t.db.insert(legacyMealItems).values(
    items.map((item, position) => ({
      userId,
      mealId: meal!.id,
      position,
      name: item.name,
      kcal: item.kcal,
      carbsG: item.carbsG ?? null,
      fatG: item.fatG ?? null,
      proteinG: item.proteinG ?? null,
      createdAt,
    })),
  );
}

beforeAll(async () => {
  t = await createTestDatabase();
  for (const email of ["india@example.test", "nowhere@example.test"]) {
    const user = await t.createAuthUser(email);
    await withUser(t.db, user.id, (tx) => ensureProfile(tx, user));
    if (email.startsWith("india")) india = user.id;
    else nowhere = user.id;
  }
  await t.db.update(profiles).set({ timeZone: "Asia/Kolkata" }).where(eq(profiles.id, india));
  // Not a zone Postgres knows: the hour is read in UTC rather than failing the deploy.
  await t.db.update(profiles).set({ timeZone: "Nowhere/Special" }).where(eq(profiles.id, nowhere));

  // 08:00 in Kolkata.
  await oldMeal(india, "Morning meal 1", "2026-09-24T02:30:00Z", [
    { name: "Oats, 80 g", kcal: 303, carbsG: 54, fatG: 5.5, proteinG: 10.5 },
    { name: "Milk, 250 ml", kcal: 160, carbsG: 12, fatG: 8, proteinG: 8.5 },
  ]);
  // 16:00: an afternoon snack. The milk is logged again, in other capitals, with other figures.
  await oldMeal(india, "Afternoon meal 1", "2026-09-24T10:30:00Z", [
    { name: " Peanut butter ", kcal: 441.5, carbsG: 15, fatG: 37.5, proteinG: 18.8 },
    { name: "milk, 250 ml", kcal: 150, carbsG: 12, fatG: 7, proteinG: 8 },
  ]);
  // 23:00, but the name says dinner; the one food has no name and no macronutrients.
  await oldMeal(india, "Dinner at the Thai place", "2026-09-24T17:30:00Z", [
    { name: null, kcal: 1050 },
  ]);
  // 01:30 on the 25th in Kolkata, logged for the 24th: an evening snack of that day.
  await oldMeal(india, "Afternoon meal 2", "2026-09-24T20:00:00Z", [{ name: "Chips", kcal: 250 }]);
  // 13:00 UTC for the account whose zone Postgres does not know.
  await oldMeal(nowhere, "Something", "2026-09-24T13:00:00Z", [{ name: "Rice", kcal: 400 }]);

  await t.db.insert(savedMeals).values({
    userId: india,
    name: "Protein shake",
    // As the previous deployment stored them: no portion, no amount, a name or none.
    items: [
      { name: null, kcal: 280, carbsG: 15, fatG: 9.5, proteinG: 32.5 },
      { name: "MILK, 250 ml", kcal: 160, carbsG: 12, fatG: 8, proteinG: 8.5 },
    ] as unknown as (typeof savedMeals.$inferInsert)["items"],
  });

  await runMigration();
});

afterAll(async () => {
  await t.close();
});

it("keeps every named food as one of the account's foods, one per name, as last logged", async () => {
  const rows = await t.db
    .select({
      name: foods.name,
      portionAmount: foods.portionAmount,
      unit: foods.unit,
      kcal: foods.kcal,
      fatG: foods.fatG,
      lastLoggedAt: foods.lastLoggedAt,
    })
    .from(foods)
    .where(eq(foods.userId, india));
  // Sorted here, whatever the database's collation makes of capitals.
  rows.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  expect(rows).toEqual([
    {
      name: "Chips",
      portionAmount: 1,
      unit: "serving",
      kcal: 250,
      fatG: null,
      lastLoggedAt: new Date("2026-09-24T20:00:00Z"),
    },
    {
      name: "milk, 250 ml",
      portionAmount: 1,
      unit: "serving",
      kcal: 150,
      fatG: 7,
      lastLoggedAt: new Date("2026-09-24T10:30:00Z"),
    },
    {
      name: "Oats, 80 g",
      portionAmount: 1,
      unit: "serving",
      kcal: 303,
      fatG: 5.5,
      lastLoggedAt: new Date("2026-09-24T02:30:00Z"),
    },
    {
      name: "Peanut butter",
      portionAmount: 1,
      unit: "serving",
      kcal: 441.5,
      fatG: 37.5,
      lastLoggedAt: new Date("2026-09-24T10:30:00Z"),
    },
  ]);
});

it("moves every food of every old meal into the meal of the day its name or hour says", async () => {
  const entries = await t.db
    .select({
      meal: foodEntries.meal,
      name: foodEntries.name,
      amount: foodEntries.amount,
      unit: foodEntries.unit,
      kcal: foodEntries.kcal,
      proteinG: foodEntries.proteinG,
      linked: foodEntries.foodId,
    })
    .from(foodEntries)
    .where(eq(foodEntries.userId, india))
    .orderBy(asc(foodEntries.createdAt), asc(foodEntries.position));
  expect(entries.map(({ linked, ...entry }) => ({ ...entry, linked: linked !== null }))).toEqual([
    {
      meal: "breakfast",
      name: "Oats, 80 g",
      amount: 1,
      unit: "serving",
      kcal: 303,
      proteinG: 10.5,
      linked: true,
    },
    {
      meal: "breakfast",
      name: "Milk, 250 ml",
      amount: 1,
      unit: "serving",
      kcal: 160,
      proteinG: 8.5,
      linked: true,
    },
    {
      meal: "afternoon_snack",
      name: "Peanut butter",
      amount: 1,
      unit: "serving",
      kcal: 441.5,
      proteinG: 18.8,
      linked: true,
    },
    {
      meal: "afternoon_snack",
      name: "milk, 250 ml",
      amount: 1,
      unit: "serving",
      kcal: 150,
      proteinG: 8,
      linked: true,
    },
    // An unnamed food takes its meal's name, and is not kept as a food of its own.
    {
      meal: "dinner",
      name: "Dinner at the Thai place",
      amount: 1,
      unit: "serving",
      kcal: 1050,
      proteinG: null,
      linked: false,
    },
    {
      meal: "evening_snack",
      name: "Chips",
      amount: 1,
      unit: "serving",
      kcal: 250,
      proteinG: null,
      linked: true,
    },
  ]);
  const [elsewhere] = await t.db
    .select({ meal: foodEntries.meal, eatenOn: foodEntries.eatenOn })
    .from(foodEntries)
    .where(eq(foodEntries.userId, nowhere));
  expect(elsewhere).toEqual({ meal: "lunch", eatenOn: "2026-09-24" });
});

it("keeps each day's total exactly what it was", async () => {
  const days = await t.client.query<{ user_id: string; before: string; after: string }>(`
    select m.user_id,
           (select sum(kcal) from meal_items i where i.user_id = m.user_id)::text as before,
           (select sum(kcal * amount / portion_amount) from food_entries e
             where e.user_id = m.user_id)::text as after
    from meals m group by m.user_id`);
  for (const day of days.rows) expect(Number(day.after)).toBe(Number(day.before));
});

it("gives saved meals' foods a portion and an amount, and links the foods it can", async () => {
  const [shake] = await t.db
    .select({ items: savedMeals.items })
    .from(savedMeals)
    .where(eq(savedMeals.userId, india));
  const [milk] = await t.db
    .select({ id: foods.id })
    .from(foods)
    .where(eq(foods.name, "milk, 250 ml"));
  expect(shake!.items).toEqual([
    {
      foodId: null,
      name: "Protein shake",
      portionAmount: 1,
      unit: "serving",
      kcal: 280,
      carbsG: 15,
      fatG: 9.5,
      proteinG: 32.5,
      amount: 1,
    },
    {
      foodId: milk!.id,
      name: "MILK, 250 ml",
      portionAmount: 1,
      unit: "serving",
      kcal: 160,
      carbsG: 12,
      fatG: 8,
      proteinG: 8.5,
      amount: 1,
    },
  ]);
});

it("changes nothing when it runs again", async () => {
  const snapshot = async () => ({
    foods: await t.db.select().from(foods).orderBy(asc(foods.id)),
    entries: await t.db.select().from(foodEntries).orderBy(asc(foodEntries.id)),
    saved: await t.db.select().from(savedMeals).orderBy(asc(savedMeals.id)),
  });
  const before = await snapshot();
  await runMigration();
  expect(await snapshot()).toEqual(before);
});
