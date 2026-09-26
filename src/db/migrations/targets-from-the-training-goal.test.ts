import { readFile } from "node:fs/promises";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";

import { nutritionTargets, profiles } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { ensureProfile } from "@/server/queries/profile";

/**
 * Migration 0042, against targets written before it.
 *
 * Every test database migrates a fresh schema, where the conversion in 0042 finds nothing. So the
 * targets are written afterwards, the way the previous deployment wrote them, and the file is run
 * again the way the migrator runs it: in one transaction. Running it a third time must change
 * nothing, which is what makes it safe to replay.
 */

let t: TestDatabase;
const accounts: Record<"fixed" | "weightless" | "weighed" | "heavy", string> = {
  fixed: "",
  weightless: "",
  weighed: "",
  heavy: "",
};

async function runMigration(): Promise<void> {
  const file = await readFile("src/db/migrations/0042_targets_from_the_training_goal.sql", "utf8");
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

async function targetsOf(userId: string) {
  const [row] = await t.db
    .select({
      dailyKcal: nutritionTargets.dailyKcal,
      proteinPerKg: nutritionTargets.proteinPerKg,
      fatPercent: nutritionTargets.fatPercent,
      split: nutritionTargets.macroSplit,
      updatedAt: nutritionTargets.updatedAt,
    })
    .from(nutritionTargets)
    .where(eq(nutritionTargets.userId, userId));
  return row!;
}

beforeAll(async () => {
  t = await createTestDatabase();
  for (const name of Object.keys(accounts) as (keyof typeof accounts)[]) {
    const user = await t.createAuthUser(`${name}@example.test`);
    await withUser(t.db, user.id, (tx) => ensureProfile(tx, user));
    accounts[name] = user.id;
  }
  const weights = { fixed: 63.5, weightless: null, weighed: 80, heavy: 45 } as const;
  for (const [name, weight] of Object.entries(weights)) {
    await t.db
      .update(profiles)
      .set({ bodyWeightKg: weight })
      .where(eq(profiles.id, accounts[name as keyof typeof accounts]));
  }
  // As the previous deployment wrote them: no fat share, and a split of their choosing.
  await t.db.insert(nutritionTargets).values([
    { userId: accounts.fixed, dailyKcal: 2700, proteinPerKg: 1.8, macroSplit: "fixed_55_25_20" },
    {
      userId: accounts.weightless,
      dailyKcal: 2200,
      proteinPerKg: 1.8,
      macroSplit: "fixed_55_25_20",
    },
    { userId: accounts.weighed, dailyKcal: 2400, proteinPerKg: 2.2, macroSplit: "body_weight" },
    // 20% of 10,000 kcal at 45 kg would be 11.1 g/kg: kept to the bound.
    { userId: accounts.heavy, dailyKcal: 10_000, proteinPerKg: 1.8, macroSplit: "fixed_55_25_20" },
  ]);
  await runMigration();
});

afterAll(async () => {
  await t.close();
});

it("moves a fixed split to protein per kilogram, keeping its protein at 20% of the target", async () => {
  // 20% of 2,700 kcal is 135 g; at 63.5 kg that is 2.13 g/kg, stored as 2.1.
  expect(await targetsOf(accounts.fixed)).toMatchObject({
    dailyKcal: 2700,
    proteinPerKg: 2.1,
    fatPercent: 25,
    split: "body_weight",
  });
});

it("keeps protein inside the table's bounds", async () => {
  expect(await targetsOf(accounts.heavy)).toMatchObject({ proteinPerKg: 4, split: "body_weight" });
});

it("leaves an account with no body weight, and one already on body weight, as they were", async () => {
  expect(await targetsOf(accounts.weightless)).toMatchObject({
    proteinPerKg: 1.8,
    fatPercent: 25,
    split: "fixed_55_25_20",
  });
  expect(await targetsOf(accounts.weighed)).toMatchObject({
    proteinPerKg: 2.2,
    fatPercent: 25,
    split: "body_weight",
  });
});

it("changes nothing when it runs again", async () => {
  const before = await Promise.all(Object.values(accounts).map(targetsOf));
  await runMigration();
  expect(await Promise.all(Object.values(accounts).map(targetsOf))).toEqual(before);
});

it("refuses a fat share outside the bounds that catch a slipped finger", async () => {
  await expect(
    t.db
      .update(nutritionTargets)
      .set({ fatPercent: 250 })
      .where(eq(nutritionTargets.userId, accounts.weighed)),
  ).rejects.toThrow();
});
