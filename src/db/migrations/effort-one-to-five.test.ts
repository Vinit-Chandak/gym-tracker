import { readFile } from "node:fs/promises";

import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";

import { activities, runningActivityDetails } from "@/db/schema";
import { seedLegacyAccount } from "@/db/test/multisport-fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";

/**
 * Migration 0033, run as the file itself writes it.
 *
 * The statements are read off disk rather than paraphrased here, because a paraphrase that
 * agrees with the assertions proves nothing about the file that will actually run against
 * the production table. The table is first put back into its pre-migration shape — the 1–10
 * constraint from 0026 — so rows on the old scale can be written the way they were written.
 */

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});
afterEach(async () => {
  await t.close();
});

/** The check as 0026 wrote it, restored so old-scale rows can be inserted. */
const CONSTRAINT_0026 = `ALTER TABLE "activities" ADD CONSTRAINT "activities_effort_chk"
  CHECK ((effort_status = 'reported' and effort_value is not null and effort_value between 1 and 10)
    or (effort_status = 'unknown' and effort_value is null)
    or effort_status = 'legacy_unconfirmed')`;

async function backToTheOldScale(): Promise<void> {
  await t.client.exec(`ALTER TABLE "activities" DROP CONSTRAINT "activities_effort_chk"`);
  await t.client.exec(CONSTRAINT_0026);
}

/**
 * All of it in one transaction, because that is the only way it ever runs.
 *
 * Drizzle's migrator wraps a file in a single transaction, and statement-at-a-time is a
 * different thing entirely: `activities` carries a deferred constraint trigger, so the
 * rescale below queues one pending event per row and Postgres refuses to ALTER a table that
 * has any. Run apart, each statement commits and the trigger fires in between, and the
 * failure this test exists to catch cannot happen.
 */
async function runMigration(): Promise<void> {
  const file = await readFile("src/db/migrations/0033_effort_one_to_five.sql", "utf8");
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

let nextDay = 0;

/** One activity with its required typed detail, written as a pair the trigger accepts. */
async function logged(
  userId: string,
  effort: { status: "reported" | "unknown" | "legacy_unconfirmed"; value: number | null },
): Promise<string> {
  nextDay += 1;
  const day = String(nextDay).padStart(2, "0");
  return t.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(activities)
      .values({
        userId,
        sport: "running",
        status: "completed",
        outcome: "logged",
        startedAt: new Date(`2026-09-${day}T06:00:00Z`),
        recordedTimeZone: "UTC",
        timeZoneSource: "entered",
        occurredOn: `2026-09-${day}`,
        durationMs: 1_800_000,
        effortStatus: effort.status,
        effortValue: effort.value,
        sourceKind: "manual",
      })
      .returning({ id: activities.id });
    await tx.insert(runningActivityDetails).values({
      activityId: row!.id,
      userId,
      sport: "running",
      environment: "outdoor",
      distanceMetres: 5000,
      distanceNativeValue: 5,
      distanceNativeUnit: "km",
    });
    return row!.id;
  });
}

async function account(email: string) {
  const user = await t.createAuthUser(email);
  const seeded = await seedLegacyAccount(t.db, user, {
    logPlannedRun: false,
    logAdHocRun: false,
    finishSession: false,
  });
  return seeded.userId;
}

async function effortOf(id: string) {
  const [row] = await t.db
    .select({ status: activities.effortStatus, value: activities.effortValue })
    .from(activities)
    .where(eq(activities.id, id));
  return row;
}

it("halves every reported rating onto the new scale, holding 1 at 1", async () => {
  const userId = await account("scale@example.test");
  await backToTheOldScale();
  const ids: string[] = [];
  for (let value = 1; value <= 10; value += 1) {
    ids.push(await logged(userId, { status: "reported", value }));
  }

  await runMigration();

  const after = await Promise.all(ids.map(effortOf));
  // 1→1, 2–3→1, 4–5→2, 6–7→3, 8–9→4, 10→5. Every old rating lands on the new scale, and
  // nothing lands on a 0 the picker could not show.
  expect(after.map((row) => row?.value)).toEqual([1, 1, 1, 2, 2, 3, 3, 4, 4, 5]);
  expect(after.every((row) => row?.status === "reported")).toBe(true);
});

it("leaves Not sure as Not sure", async () => {
  const userId = await account("unsure@example.test");
  await backToTheOldScale();
  const id = await logged(userId, { status: "unknown", value: null });

  await runMigration();

  // The one answer that is not a number does not acquire one, least of all a 1.
  expect(await effortOf(id)).toEqual({ status: "unknown", value: null });
});

it("rescales an unconfirmed rating without confirming it", async () => {
  const userId = await account("unconfirmed@example.test");
  await backToTheOldScale();
  const ordinary = await logged(userId, { status: "legacy_unconfirmed", value: 5 });
  const absent = await logged(userId, { status: "legacy_unconfirmed", value: null });
  // The unbounded branch of the check let these through; they are halved, not clamped.
  const aboveTheScale = await logged(userId, { status: "legacy_unconfirmed", value: 12 });

  await runMigration();

  expect(await effortOf(ordinary)).toEqual({ status: "legacy_unconfirmed", value: 2 });
  expect(await effortOf(absent)).toEqual({ status: "legacy_unconfirmed", value: null });
  expect(await effortOf(aboveTheScale)).toEqual({ status: "legacy_unconfirmed", value: 6 });
});

it("refuses a reported rating off the new scale once it has run", async () => {
  const userId = await account("bounds@example.test");
  await backToTheOldScale();
  await runMigration();

  await expect(logged(userId, { status: "reported", value: 6 })).rejects.toThrow();
  await expect(logged(userId, { status: "reported", value: 0 })).rejects.toThrow();
  const accepted = await logged(userId, { status: "reported", value: 5 });
  expect(await effortOf(accepted)).toEqual({ status: "reported", value: 5 });
});

it("is idempotent in the only sense that matters: it is not run twice", async () => {
  const userId = await account("once@example.test");
  await backToTheOldScale();
  const id = await logged(userId, { status: "reported", value: 10 });

  await runMigration();
  expect(await effortOf(id)).toEqual({ status: "reported", value: 5 });

  // Running it again would halve a 5 to a 2. The journal is what stops that, so this states
  // the cost of a second run rather than pretending the statement guards against it.
  await runMigration();
  expect(await effortOf(id)).toEqual({ status: "reported", value: 2 });
});

it("touches nothing but the effort columns", async () => {
  const userId = await account("untouched@example.test");
  await backToTheOldScale();
  const id = await logged(userId, { status: "reported", value: 8 });
  const [before] = await t.db
    .select()
    .from(activities)
    .where(eq(activities.id, id))
    .orderBy(asc(activities.id));

  await runMigration();

  const [after] = await t.db.select().from(activities).where(eq(activities.id, id));
  expect({ ...after, effortValue: null, updatedAt: null }).toEqual({
    ...before,
    effortValue: null,
    updatedAt: null,
  });
  expect(after?.revision).toBe(before?.revision);
});
