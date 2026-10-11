import { readFile } from "node:fs/promises";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";

import { profiles } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { ensureProfile } from "@/server/queries/profile";

/**
 * Migration 0049, run as the file itself writes it: a profile's zone is spelt as the zone
 * database spells it, and nothing else about it changes.
 */

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.close();
});

async function runMigration(): Promise<void> {
  const file = await readFile(
    "src/db/migrations/0049_time_zones_spelt_as_the_zone_database.sql",
    "utf8",
  );
  for (const statement of file.split("--> statement-breakpoint")) {
    await t.client.exec(statement.trim());
  }
}

/** An account whose profile says `timeZone`, as the free-text field once saved it. */
async function account(timeZone: string): Promise<string> {
  const user = await t.createAuthUser(`${crypto.randomUUID()}@example.com`);
  await ensureProfile(t.db, user);
  await t.db.update(profiles).set({ timeZone }).where(eq(profiles.id, user.id));
  return user.id;
}

async function zoneOf(userId: string): Promise<string> {
  const [row] = await t.db
    .select({ timeZone: profiles.timeZone })
    .from(profiles)
    .where(eq(profiles.id, userId));
  return row!.timeZone;
}

it("mends the case of a zone Postgres knows, and leaves every other zone as it was", async () => {
  const typed = {
    "asia/kolkata": "Asia/Kolkata",
    "EUROPE/LONDON": "Europe/London",
    "america/new_york": "America/New_York",
    utc: "UTC",
    // Already spelt right, including a name the zone database keeps for an old one.
    "Asia/Kolkata": "Asia/Kolkata",
    "Asia/Calcutta": "Asia/Calcutta",
    // Not a place: nothing says which was meant, so Edit profile asks.
    "+05:30": "+05:30",
    IST: "IST",
    "Not/AZone": "Not/AZone",
  };
  const accounts = await Promise.all(
    Object.keys(typed).map(async (zone) => [zone, await account(zone)] as const),
  );

  await runMigration();
  for (const [zone, userId] of accounts)
    expect(await zoneOf(userId)).toBe(typed[zone as keyof typeof typed]);

  // A second run finds nothing spelt differently.
  await runMigration();
  for (const [zone, userId] of accounts)
    expect(await zoneOf(userId)).toBe(typed[zone as keyof typeof typed]);
});
