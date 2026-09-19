import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";

import { backfillMultisport } from "@/db/backfill-multisport";
import { activities, plannedOccurrences, sharedSessionStats } from "@/db/schema";
import { seedLegacyAccount } from "@/db/test/multisport-fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { validateMultisport } from "@/db/validate-multisport";

/**
 * AT-MIG-05 / AT-DATA-04: the constraints are added because the data earned them.
 *
 * The property under test is the refusal. It is easy to write a validation step that adds a
 * foreign key and reports success; the one that matters is the one that notices a row it
 * cannot honestly constrain, declines, and says which row and why — rather than deleting it
 * to make the `alter table` succeed.
 */

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});
afterEach(async () => {
  await t.close();
});

async function backfilled(email: string) {
  const user = await t.createAuthUser(email);
  const account = await seedLegacyAccount(t.db, user);
  await backfillMultisport(t.db, { userId: account.userId });
  return account;
}

it("adds the constraints once the backfill reconciles", async () => {
  await backfilled("clean@example.test");
  const report = await validateMultisport(t.db);
  expect(report.checks.filter((check) => !check.ok)).toEqual([]);
  expect(report.applied).toBe(true);
  expect(report.constraints).toEqual(["shared_session_stats_activity_fk"]);

  // Idempotent: a second run finds them already there and adds nothing.
  const again = await validateMultisport(t.db);
  expect(again.applied).toBe(true);
  expect(again.constraints).toEqual([]);
});

it("reports without applying anything on a dry run", async () => {
  await backfilled("dry@example.test");
  const report = await validateMultisport(t.db, { dryRun: true });
  expect(report.applied).toBe(false);
  expect(report.constraints).toEqual([]);
  const [row] = await t.db.execute<{ value: number }>(
    sql`select count(*)::int as value from pg_constraint
        where conname = 'activities_occurrence_owner_fk'`,
  ).then((result) => (Array.isArray(result) ? result : result.rows));
  expect(row?.value).toBe(0);
});

/** §10.3: a shared row whose source cannot be resolved is a fact to look at, not one to delete. */
it("refuses to constrain a shared row whose source is missing", async () => {
  const account = await backfilled("orphan@example.test");
  const [shared] = await t.db
    .select({ id: sharedSessionStats.id })
    .from(sharedSessionStats)
    .where(eq(sharedSessionStats.userId, account.userId))
    .limit(1);
  expect(shared).toBeDefined();
  await t.db
    .update(sharedSessionStats)
    .set({ activityId: crypto.randomUUID() })
    .where(eq(sharedSessionStats.id, shared!.id));

  const report = await validateMultisport(t.db);
  expect(report.applied).toBe(false);
  const failure = report.checks.find((check) => !check.ok);
  expect(failure?.name).toContain("shared projections");
  expect(failure?.detail).toContain("do not delete them");

  // And the row is still there, untouched.
  const [after] = await t.db
    .select({ id: sharedSessionStats.id })
    .from(sharedSessionStats)
    .where(eq(sharedSessionStats.id, shared!.id));
  expect(after?.id).toBe(shared!.id);
});

/**
 * AT-DATA-02: a link across an account is refused by the schema, not merely by the gate.
 *
 * This is the stronger statement, and it is the one that turned out to be true: M1's
 * composite key already carries the owner and the sport, so the forged link cannot be written
 * at all. The validation gate's matching check is therefore a report on an invariant that
 * holds rather than the thing enforcing it — which is why M2 adds no constraint for it.
 */
it("cannot even write a link that crosses an account boundary", async () => {
  const mine = await backfilled("owner@example.test");
  const theirs = await backfilled("other@example.test");
  const [foreign] = await t.db
    .select({ id: plannedOccurrences.id })
    .from(plannedOccurrences)
    .where(
      sql`${plannedOccurrences.userId} = ${theirs.userId}
        and not exists (
          select 1 from ${activities} where ${activities.occurrenceId} = ${plannedOccurrences.id})`,
    )
    .limit(1);
  const [ours] = await t.db
    .select({ id: activities.id })
    .from(activities)
    .where(sql`${activities.userId} = ${mine.userId} and ${activities.occurrenceId} is not null`)
    .limit(1);
  expect(foreign).toBeDefined();
  expect(ours).toBeDefined();

  await expect(
    t.db
      .update(activities)
      .set({ occurrenceId: foreign!.id })
      .where(eq(activities.id, ours!.id)),
  ).rejects.toThrow();

  // The gate still reports the invariant, and the constraints go on.
  const report = await validateMultisport(t.db);
  expect(report.checks.find((check) => check.name.includes("owner and sport"))?.ok).toBe(true);
  expect(report.applied).toBe(true);
});
