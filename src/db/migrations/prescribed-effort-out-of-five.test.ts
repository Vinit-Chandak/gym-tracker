import { readFile } from "node:fs/promises";

import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";

import { programRuns } from "@/db/schema";
import { seedLegacyAccount } from "@/db/test/multisport-fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "@/db/seed/data/program";
import { programBlueprintSchema } from "@/domain/program-blueprint";

/**
 * Migration 0034, and the reason it is not optional.
 *
 * `programs.ts` rebuilds a blueprint from these columns on every programme read and parses
 * it. The last case here is the one that matters: an out-of-ten programme left unmigrated
 * fails that parse once the bound comes down, so the statements and the schema have to ship
 * together. The file is read off disk rather than paraphrased.
 */

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});
afterEach(async () => {
  await t.close();
});

/** One transaction, because the migrator wraps a file in one. See 0033's test for why. */
async function runMigration(): Promise<void> {
  const file = await readFile("src/db/migrations/0034_prescribed_effort_out_of_five.sql", "utf8");
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

/** A seeded account already carries a programme; its run weeks are what we rewrite. */
async function seededProgramRuns(email: string) {
  const user = await t.createAuthUser(email);
  const account = await seedLegacyAccount(t.db, user, {
    logPlannedRun: false,
    logAdHocRun: false,
    finishSession: false,
  });
  const [run] = await t.db
    .select({ id: programRuns.id })
    .from(programRuns)
    .where(eq(programRuns.userId, account.userId))
    .orderBy(asc(programRuns.weekIndex))
    .limit(1);
  return { userId: account.userId, runId: run!.id };
}

async function rpeOf(id: string) {
  const [row] = await t.db
    .select({ min: programRuns.rpeMin, max: programRuns.rpeMax })
    .from(programRuns)
    .where(eq(programRuns.id, id));
  return row;
}

async function setRpe(id: string, min: number | null, max: number | null) {
  await t.db.update(programRuns).set({ rpeMin: min, rpeMax: max }).where(eq(programRuns.id, id));
}

it("halves a prescribed range onto the five-step scale", async () => {
  const { runId } = await seededProgramRuns("range@example.test");
  await setRpe(runId, 6, 7);

  await runMigration();

  // The same map 0033 used, so a target and a report that agreed before still agree.
  expect(await rpeOf(runId)).toEqual({ min: 3, max: 3 });
});

it("keeps a zero meaning nothing was asked", async () => {
  const { runId } = await seededProgramRuns("zero@example.test");
  // `programBlueprintFromRows` reads a missing effort as 0, so a 0 is not an effort of 1.
  await setRpe(runId, 0, 0);

  await runMigration();

  expect(await rpeOf(runId)).toEqual({ min: 0, max: 0 });
});

it("holds a prescribed 1 at 1 rather than dropping it to nothing asked", async () => {
  const { runId } = await seededProgramRuns("one@example.test");
  await setRpe(runId, 1, 2);

  await runMigration();

  expect(await rpeOf(runId)).toEqual({ min: 1, max: 1 });
});

it("leaves an unprescribed effort unprescribed", async () => {
  const { runId } = await seededProgramRuns("null@example.test");
  await setRpe(runId, null, null);

  await runMigration();

  expect(await rpeOf(runId)).toEqual({ min: null, max: null });
});

/** The whole reason the statements and the bound cannot ship in separate deploys. */
it("is what keeps an existing programme readable under the new bound", () => {
  // The real blueprint the seed ships, with one run week put back on the old scale — which
  // is exactly what `programBlueprintFromRows` would hand the parser for an unmigrated row.
  expect(programBlueprintSchema.safeParse(withRunEffort([6, 7])).success).toBe(false);
  expect(programBlueprintSchema.safeParse(withRunEffort([3, 3])).success).toBe(true);
  // The programme as shipped asks within five, and means it: its easy runs are 1–2.
  expect(programBlueprintSchema.safeParse(STRENGTH_AESTHETICS_HYBRID_8WK).success).toBe(true);
  expect(STRENGTH_AESTHETICS_HYBRID_8WK.runs.every((run) => run.rpe[1] <= 2)).toBe(true);
});

function withRunEffort(rpe: [number, number]) {
  return {
    ...STRENGTH_AESTHETICS_HYBRID_8WK,
    runs: STRENGTH_AESTHETICS_HYBRID_8WK.runs.map((run, index) =>
      index === 0 ? { ...run, rpe } : run,
    ),
  };
}
