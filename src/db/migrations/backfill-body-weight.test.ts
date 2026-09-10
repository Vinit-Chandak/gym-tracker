import { readFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "../test/pglite";

/**
 * Migration 0010 turns body weights that were only ever attached to a finished workout into
 * readings of their own, so an account that has been training for months arrives at the new
 * Progress chart with its history already there.
 *
 * The tests below run the migration's own statements — read out of the file, not retyped —
 * against data that looks like it was written before it existed. The migration itself has
 * already run against empty tables by the time the test database is built, which proves it
 * applies but says nothing about what it does with rows, which is the part that can be wrong.
 */
const BACKFILL = readFileSync(
  new URL("./0010_profile_measurements_and_body_weight.sql", import.meta.url),
  "utf8",
)
  .split("--> statement-breakpoint")
  // Each backfill statement is introduced by comment lines explaining it; drop those so the
  // statement can be recognised by what it does.
  .map((statement) =>
    statement
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim(),
  )
  .filter(
    (statement) =>
      statement.startsWith('INSERT INTO "body_weight_logs"') ||
      statement.startsWith('UPDATE "profiles"'),
  );

let t: TestDatabase;

type Row = { measured_on: string; weight_kg: string };

async function backfill(): Promise<void> {
  for (const statement of BACKFILL) await t.client.exec(statement);
}

async function readings(userId: string): Promise<Row[]> {
  const result = await t.client.query<Row>(
    `select measured_on::text, weight_kg from body_weight_logs where user_id = $1
     order by measured_on`,
    [userId],
  );
  return result.rows;
}

async function profileWeight(userId: string): Promise<string | null> {
  const result = await t.client.query<{ body_weight_kg: string | null }>(
    "select body_weight_kg from profiles where id = $1",
    [userId],
  );
  return result.rows[0]?.body_weight_kg ?? null;
}

/**
 * An account with a time zone, a stated weight, and the moment that weight was last written.
 * The profile row itself already exists: the auth bridge's trigger writes one for every new
 * sign-in record, which is exactly what happens in Supabase.
 */
async function account(
  email: string,
  timeZone: string,
  bodyWeightKg: number | null,
  updatedAt: string,
): Promise<string> {
  const { id } = await t.createAuthUser(email);
  await t.client.query(
    "update profiles set time_zone = $2, body_weight_kg = $3, updated_at = $4 where id = $1",
    [id, timeZone, bodyWeightKg, updatedAt],
  );
  return id;
}

async function gymFor(userId: string, name: string): Promise<string> {
  const result = await t.client.query<{ id: string }>(
    `insert into gyms (user_id, name, slug, kind) values ($1, $2, $3, 'gym') returning id`,
    [userId, name, name.toLowerCase()],
  );
  return result.rows[0]!.id;
}

async function session(
  userId: string,
  gymId: string,
  startedAt: string,
  bodyWeightKg: number | null,
): Promise<void> {
  await t.client.query(
    `insert into workout_sessions (user_id, gym_id, started_at, completed_at, body_weight_kg)
     values ($1, $2, $3, $3, $4)`,
    [userId, gymId, startedAt, bodyWeightKg],
  );
}

beforeAll(async () => {
  t = await createTestDatabase();
});

afterAll(async () => {
  await t.close();
});

describe("migration 0010 body weight backfill", () => {
  it("finds the three statements it is meant to run", () => {
    expect(BACKFILL).toHaveLength(3);
  });

  it("dates a workout's weight in the account's own time zone", async () => {
    // 20:30 on the 4th in New York is already the 5th in UTC. The reading belongs to the day
    // the person actually trained.
    const userId = await account(
      "tz@example.com",
      "America/New_York",
      null,
      "2026-03-01T00:00:00Z",
    );
    const gymId = await gymFor(userId, "tz-gym");
    await session(userId, gymId, "2026-03-05T01:30:00Z", 80);
    await backfill();

    expect(await readings(userId)).toEqual([{ measured_on: "2026-03-04", weight_kg: "80.00" }]);
    expect(await profileWeight(userId)).toBe("80.00");
  });

  it("keeps the later session when a day holds two", async () => {
    const userId = await account("twice@example.com", "UTC", null, "2026-03-01T00:00:00Z");
    const gymId = await gymFor(userId, "twice-gym");
    await session(userId, gymId, "2026-03-05T07:00:00Z", 80);
    await session(userId, gymId, "2026-03-05T18:00:00Z", 81);
    await backfill();

    expect(await readings(userId)).toEqual([{ measured_on: "2026-03-05", weight_kg: "81.00" }]);
  });

  it("keeps a stated weight that is newer than the last workout", async () => {
    const userId = await account("stated@example.com", "UTC", 70, "2026-06-01T12:00:00Z");
    const gymId = await gymFor(userId, "stated-gym");
    await session(userId, gymId, "2026-03-05T07:00:00Z", 80);
    await backfill();

    expect(await readings(userId)).toEqual([
      { measured_on: "2026-03-05", weight_kg: "80.00" },
      { measured_on: "2026-06-01", weight_kg: "70.00" },
    ]);
    expect(await profileWeight(userId)).toBe("70.00");
  });

  it("moves a stated weight on when a later workout knows better", async () => {
    const userId = await account("stale@example.com", "UTC", 70, "2026-01-01T12:00:00Z");
    const gymId = await gymFor(userId, "stale-gym");
    await session(userId, gymId, "2026-03-05T07:00:00Z", 80);
    await backfill();

    expect(await profileWeight(userId)).toBe("80.00");
  });

  it("leaves an account with nothing to say alone", async () => {
    const userId = await account("empty@example.com", "UTC", null, "2026-01-01T12:00:00Z");
    const gymId = await gymFor(userId, "empty-gym");
    await session(userId, gymId, "2026-03-05T07:00:00Z", null);
    await backfill();

    expect(await readings(userId)).toEqual([]);
    expect(await profileWeight(userId)).toBeNull();
  });

  it("lets a workout outrank a stated weight written the same day", async () => {
    // The statements run in order and the readings go in first, so a day that was trained is
    // the weight taken at the gym rather than the number that was already on the profile.
    const userId = await account("sameday@example.com", "UTC", 70, "2026-03-05T21:00:00Z");
    const gymId = await gymFor(userId, "sameday-gym");
    await session(userId, gymId, "2026-03-05T07:00:00Z", 80);
    await backfill();

    expect(await readings(userId)).toEqual([{ measured_on: "2026-03-05", weight_kg: "80.00" }]);
    expect(await profileWeight(userId)).toBe("80.00");
  });
});
