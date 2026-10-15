import { readFile } from "node:fs/promises";

import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";

import { programRuns } from "@/db/schema";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "@/db/seed/data/program";
import { seedReferenceData } from "@/db/seed/reference";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { createProgramFromBlueprint } from "@/server/repositories/programs";

/** Migration 0052, run as the file itself writes it. */

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
});
afterAll(async () => {
  await t.close();
});

async function runMigration(): Promise<void> {
  const file = await readFile("src/db/migrations/0052_run_efforts_back_inside_five.sql", "utf8");
  for (const statement of file.split("--> statement-breakpoint")) {
    await t.client.exec(statement.trim());
  }
}

it("halves a run's effort written out of ten, both ends together, and nothing else", async () => {
  const user = await t.createAuthUser(`${crypto.randomUUID()}@example.com`);
  const created = await withUser(t.db, user.id, (tx) =>
    createProgramFromBlueprint(tx, user.id, STRENGTH_AESTHETICS_HYBRID_8WK, {
      startDate: "2026-09-07",
    }),
  );
  const runs = await t.db
    .select({ id: programRuns.id })
    .from(programRuns)
    .where(eq(programRuns.programId, created.id))
    .orderBy(asc(programRuns.weekIndex), asc(programRuns.dayOfWeek));
  const set = (id: string, rpeMin: number, rpeMax: number) =>
    t.db.update(programRuns).set({ rpeMin, rpeMax }).where(eq(programRuns.id, id));
  // From a proposal still written out of ten: 6–8, and 4–7 whose low end looks in range.
  await set(runs[0]!.id, 6, 8);
  await set(runs[1]!.id, 4, 7);
  // Already out of five, and "nothing asked".
  await set(runs[2]!.id, 2, 3);
  await set(runs[3]!.id, 0, 0);

  const read = async () =>
    (
      await t.db
        .select({ id: programRuns.id, rpeMin: programRuns.rpeMin, rpeMax: programRuns.rpeMax })
        .from(programRuns)
        .where(eq(programRuns.programId, created.id))
    ).reduce<Record<string, [number | null, number | null]>>(
      (all, row) => ({ ...all, [row.id]: [row.rpeMin, row.rpeMax] }),
      {},
    );

  await runMigration();
  const once = await read();
  expect(once[runs[0]!.id]).toEqual([3, 4]);
  expect(once[runs[1]!.id]).toEqual([2, 3]);
  expect(once[runs[2]!.id]).toEqual([2, 3]);
  expect(once[runs[3]!.id]).toEqual([0, 0]);

  // Safe to run twice.
  await runMigration();
  expect(await read()).toEqual(once);
});
