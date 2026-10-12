import { readFile } from "node:fs/promises";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";

import { profiles, userSportPreferences } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { ensureProfile } from "@/server/queries/profile";

/**
 * Migration 0053, run as the file itself writes it: the per-sport units move to the profile,
 * where nothing stands for "as the weight unit says", and only a unit neither the old default
 * nor the weight unit explains is kept as a choice.
 */

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.close();
});

async function runMigration(): Promise<void> {
  const file = await readFile("src/db/migrations/0053_sport_units_on_the_profile.sql", "utf8");
  for (const statement of file.split("--> statement-breakpoint")) {
    await t.client.exec(statement.trim());
  }
}

type Units = { distanceUnit: "km" | "mi"; poolUnit: "m" | "yd" };

/** An account as the old per-sport rows left it: a row a sport, each with its own units. */
async function account(
  preferredUnit: "kg" | "lb",
  rows: Partial<Record<"strength" | "running" | "cycling" | "swimming", Units>>,
): Promise<string> {
  const user = await t.createAuthUser(`${crypto.randomUUID()}@example.com`);
  await ensureProfile(t.db, user);
  await t.db.update(profiles).set({ preferredUnit }).where(eq(profiles.id, user.id));
  for (const [sport, units] of Object.entries(rows))
    await t.db
      .insert(userSportPreferences)
      .values({ userId: user.id, sport: sport as keyof typeof rows, enabled: true, ...units });
  return user.id;
}

async function unitsOf(userId: string) {
  const [row] = await t.db
    .select({ distanceUnit: profiles.distanceUnit, poolUnit: profiles.poolUnit })
    .from(profiles)
    .where(eq(profiles.id, userId));
  return row;
}

it("lets every default follow the weight unit, and keeps only what neither explains", async () => {
  const defaults = { distanceUnit: "km", poolUnit: "m" } as const;
  const imperial = { distanceUnit: "mi", poolUnit: "yd" } as const;
  const accounts = {
    // Jordan logs in pounds and was read kilometres by a default nobody chose: now miles.
    poundsOnDefaults: await account("lb", { strength: defaults, running: defaults }),
    poundsInMiles: await account("lb", { running: imperial, swimming: imperial }),
    kilogramsOnDefaults: await account("kg", { running: defaults, swimming: defaults }),
    // Kilograms with miles and yard pools: set apart in setup's sheet, and kept.
    kilogramsInMiles: await account("kg", {
      running: imperial,
      cycling: imperial,
      swimming: imperial,
    }),
    // Only the ride said miles; the road is one unit now, and it is miles.
    kilogramsRidingMiles: await account("kg", { cycling: { ...defaults, distanceUnit: "mi" } }),
    // A pool unit only counts where it was the swimming row's.
    kilogramsYardsElsewhere: await account("kg", { running: { ...defaults, poolUnit: "yd" } }),
    noRowsAtAll: await account("lb", {}),
  };
  const expected = {
    poundsOnDefaults: { distanceUnit: null, poolUnit: null },
    poundsInMiles: { distanceUnit: null, poolUnit: null },
    kilogramsOnDefaults: { distanceUnit: null, poolUnit: null },
    kilogramsInMiles: { distanceUnit: "mi", poolUnit: "yd" },
    kilogramsRidingMiles: { distanceUnit: "mi", poolUnit: null },
    kilogramsYardsElsewhere: { distanceUnit: null, poolUnit: null },
    noRowsAtAll: { distanceUnit: null, poolUnit: null },
  };

  await runMigration();
  for (const [name, userId] of Object.entries(accounts))
    expect(await unitsOf(userId)).toEqual(expected[name as keyof typeof expected]);

  // Safe to run twice, and a unit chosen since is never overwritten.
  await t.db
    .update(profiles)
    .set({ distanceUnit: "km" })
    .where(eq(profiles.id, accounts.poundsInMiles));
  await runMigration();
  for (const [name, userId] of Object.entries(accounts))
    expect(await unitsOf(userId)).toEqual(
      name === "poundsInMiles"
        ? { distanceUnit: "km", poolUnit: null }
        : expected[name as keyof typeof expected],
    );
});

it("refuses a road unit for a pool and a pool unit for a road", async () => {
  const userId = await account("kg", {});
  await expect(
    t.db.update(profiles).set({ distanceUnit: "yd" }).where(eq(profiles.id, userId)),
  ).rejects.toThrow();
  await expect(
    t.db.update(profiles).set({ poolUnit: "km" }).where(eq(profiles.id, userId)),
  ).rejects.toThrow();
});
