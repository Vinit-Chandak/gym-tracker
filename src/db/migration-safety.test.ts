import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, expect, it } from "vitest";
import journal from "./migrations/meta/_journal.json";
import { assertDatabaseSchema, assertMigrationOrder } from "./migration-safety";
import { coachJobs } from "./schema";
import { createTestDatabase, type TestDatabase } from "./test/pglite";
import { jobTargetSchema } from "@/domain/coaching-workflow";

it("accepts shipped history and requires new migrations to exceed its highest timestamp", () => {
  expect(() => assertMigrationOrder(journal.entries)).not.toThrow();
  const highest = Math.max(...journal.entries.map((entry) => entry.when));
  for (const when of [highest, highest - 1])
    expect(() =>
      assertMigrationOrder([
        ...journal.entries,
        { idx: journal.entries.length, tag: "next_migration", when },
      ]),
    ).toThrow("Upgraded databases would skip it");
  expect(() =>
    assertMigrationOrder([
      ...journal.entries,
      { idx: journal.entries.length, tag: "next_migration", when: highest + 1 },
    ]),
  ).not.toThrow();
});

it("rejects broken indices and invalid timestamps before applying anything", () => {
  expect(() => assertMigrationOrder([{ idx: 1, tag: "bad_index", when: 1 }])).toThrow(
    "Invalid migration",
  );
  expect(() => assertMigrationOrder([{ idx: 0, tag: "bad_time", when: NaN }])).toThrow(
    "Invalid migration",
  );
});

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.close();
});

it("validates a fresh database against the actual application schema", async () => {
  await expect(assertDatabaseSchema(t.db)).resolves.toBeUndefined();
});

it("repairs the existing-database upgrade that skipped 0035, without changing job state or retrying work", async () => {
  const upgrade = await createTestDatabase({ throughMigration: 34 });
  try {
    const t = upgrade;
    const user = await t.createAuthUser("migration-upgrade@example.test");
    const jobId = crypto.randomUUID();
    await t.client.query(
      `INSERT INTO coach_jobs (id, user_id, kind, trigger, dedupe_key, status, attempts, target, error)
    VALUES ($1, $2, 'prepare_session', 'daily', 'upgrade', 'failed', 3, $3, 'Retained failure')`,
      [jobId, user.id, JSON.stringify(jobTargetSchema.parse({}))],
    );
    await expect(assertDatabaseSchema(t.db)).rejects.toThrow("public.coach_jobs.attempt_budget");

    await migrate(t.db, { migrationsFolder: "src/db/migrations" });
    await expect(assertDatabaseSchema(t.db)).resolves.toBeUndefined();
    const [repaired] = await t.db.select().from(coachJobs).where(eq(coachJobs.id, jobId));
    expect(repaired).toMatchObject({
      id: jobId,
      status: "failed",
      attempts: 3,
      error: "Retained failure",
      attemptBudget: 3,
      target: jobTargetSchema.parse({}),
    });
    const { rows } = await t.client.query<{ created_at: number }>(
      "SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1",
    );
    expect(Number(rows[0]!.created_at)).toBe(journal.entries.at(-1)!.when);

    // Fresh installations already ran 0035. Replaying the repair must not reset a raised budget.
    const [raisedBudgetJob] = await t.db
      .update(coachJobs)
      .set({ attemptBudget: 6 })
      .where(eq(coachJobs.id, jobId))
      .returning();
    await t.client.exec(
      await readFile("src/db/migrations/0036_repair_coach_attempt_budget.sql", "utf8"),
    );
    await migrate(t.db, { migrationsFolder: "src/db/migrations" });
    expect((await t.db.select().from(coachJobs).where(eq(coachJobs.id, jobId)))[0]).toEqual(
      raisedBudgetJob,
    );
  } finally {
    await upgrade.close();
  }
});
