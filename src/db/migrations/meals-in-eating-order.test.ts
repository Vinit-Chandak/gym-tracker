import { readFile } from "node:fs/promises";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";

import { foodEntries } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { ensureProfile } from "@/server/queries/profile";

/**
 * Migration 0043, against entries logged before it.
 *
 * A fresh schema already has the wider check, so the entries are logged first, the way the
 * previous deployment logged them, and the file is run again the way the migrator runs it: in one
 * transaction, twice. What was logged keeps its meal; a late-night snack is taken; a meal the day
 * does not have is still refused.
 */

let t: TestDatabase;
let userId = "";

const OATS = {
  eatenOn: "2026-09-26",
  name: "Oats",
  portionAmount: 100,
  unit: "g",
  kcal: 389,
  carbsG: 66.3,
  fatG: 6.9,
  proteinG: 16.9,
  amount: 50,
} as const;

async function runMigration(): Promise<void> {
  const file = await readFile("src/db/migrations/0043_meals_in_eating_order.sql", "utf8");
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

async function mealsLogged() {
  const rows = await t.db
    .select({ meal: foodEntries.meal })
    .from(foodEntries)
    .where(eq(foodEntries.userId, userId))
    .orderBy(foodEntries.createdAt);
  return rows.map((row) => row.meal);
}

beforeAll(async () => {
  t = await createTestDatabase();
  const user = await t.createAuthUser("late@example.test");
  await withUser(t.db, user.id, (tx) => ensureProfile(tx, user));
  userId = user.id;
  await t.db.insert(foodEntries).values([
    { ...OATS, userId, meal: "dinner" },
    { ...OATS, userId, meal: "evening_snack" },
  ]);
  await runMigration();
});

afterAll(async () => {
  await t.close();
});

it("keeps what was logged in the meal it was logged in", async () => {
  expect(await mealsLogged()).toEqual(["dinner", "evening_snack"]);
});

it("changes nothing when it runs again", async () => {
  await runMigration();
  expect(await mealsLogged()).toEqual(["dinner", "evening_snack"]);
});

it("takes a late-night snack", async () => {
  await t.db.insert(foodEntries).values({ ...OATS, userId, meal: "late_night_snack" });
  expect(await mealsLogged()).toEqual(["dinner", "evening_snack", "late_night_snack"]);
});

it("still refuses a meal the day does not have", async () => {
  await expect(
    t.db.insert(foodEntries).values({ ...OATS, userId, meal: "brunch" as never }),
  ).rejects.toThrow();
});
