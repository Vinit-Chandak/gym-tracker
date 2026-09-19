import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { backfillMultisport } from "@/db/backfill-multisport";
import { activities } from "@/db/schema";
import { seedLegacyAccount, type LegacyAccount } from "@/db/test/multisport-fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";

import { activityForLegacyRun, occurrenceForLegacyPlannedRun } from "./legacy-routes";

/**
 * AT-NAV-07: an old link resolves the exact record it named, or it resolves nothing. There is
 * no "closest match" here, because the closest match is somebody else's run.
 */

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});
afterEach(async () => {
  await t.close();
});

async function seeded(email: string): Promise<LegacyAccount> {
  const user = await t.createAuthUser(email);
  const account = await seedLegacyAccount(t.db, user);
  await backfillMultisport(t.db, { userId: account.userId });
  return account;
}

describe("an old run link", () => {
  it("resolves to the activity that run became", async () => {
    const account = await seeded("runner@example.test");
    const runId = account.runIds[0]!;

    const activityId = await withUser(
      t.db,
      account.userId,
      (tx) => activityForLegacyRun(tx, account.userId, runId),
      { readOnly: true },
    );

    // The id was free, so it was kept: an old bookmark lands on the same record.
    expect(activityId).toBe(runId);
  });

  it("resolves nothing for a deleted run", async () => {
    const account = await seeded("deleted@example.test");
    const runId = account.runIds[0]!;
    await t.db.delete(activities).where(eq(activities.id, runId));

    const activityId = await withUser(
      t.db,
      account.userId,
      (tx) => activityForLegacyRun(tx, account.userId, runId),
      { readOnly: true },
    );

    expect(activityId).toBeNull();
  });

  it("resolves nothing for another athlete's run", async () => {
    const mine = await seeded("mine@example.test");
    const theirs = await seeded("theirs@example.test");

    const activityId = await withUser(
      t.db,
      mine.userId,
      (tx) => activityForLegacyRun(tx, mine.userId, theirs.runIds[0]!),
      { readOnly: true },
    );

    expect(activityId).toBeNull();
  });
});

describe("an old planned-run link", () => {
  it("resolves the exact occurrence that plan became", async () => {
    const account = await seeded("planned@example.test");

    const first = await withUser(
      t.db,
      account.userId,
      (tx) => occurrenceForLegacyPlannedRun(tx, account.userId, account.programRunIds[0]!),
      { readOnly: true },
    );
    const second = await withUser(
      t.db,
      account.userId,
      (tx) => occurrenceForLegacyPlannedRun(tx, account.userId, account.programRunIds[1]!),
      { readOnly: true },
    );

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    // Each plan resolved to its own session, not to whichever one is still unlogged.
    expect(first).not.toBe(second);
  });

  it("resolves nothing for a plan that was never mapped", async () => {
    const account = await seeded("unmapped@example.test");

    const occurrenceId = await withUser(
      t.db,
      account.userId,
      (tx) => occurrenceForLegacyPlannedRun(tx, account.userId, crypto.randomUUID()),
      { readOnly: true },
    );

    expect(occurrenceId).toBeNull();
  });

  it("resolves nothing for another athlete's plan", async () => {
    const mine = await seeded("a@example.test");
    const theirs = await seeded("b@example.test");

    const occurrenceId = await withUser(
      t.db,
      mine.userId,
      (tx) => occurrenceForLegacyPlannedRun(tx, mine.userId, theirs.programRunIds[0]!),
      { readOnly: true },
    );

    expect(occurrenceId).toBeNull();
  });
});
