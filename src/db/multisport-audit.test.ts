import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { auditMultisport, formatAudit } from "@/db/multisport-audit";
import {
  seedCrossOwnerPlannedRun,
  seedDuplicatePlannedRun,
  seedLegacyAccount,
  seedLegacyCompletionWithoutRun,
} from "@/db/test/multisport-fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";

/**
 * AT-BASE-02 and the audit half of AT-MIG: the inventory has to see what is there, name the
 * cases the migration policy has rules for, and block on the ones it does not.
 */

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});
afterEach(async () => {
  await t.close();
});

describe("a clean mixed account", () => {
  it("counts the legacy sources and projects what the backfill would write", async () => {
    const user = await t.createAuthUser("clean@example.test");
    const account = await seedLegacyAccount(t.db, user);

    const audit = await auditMultisport(t.db, { userId: account.userId });

    expect(audit.counts.runs).toBe(2);
    expect(audit.counts.workoutSessions).toBe(1);
    expect(audit.counts.programRuns).toBe(4);
    expect(audit.counts.activePrograms).toBe(1);
    // One canonical parent per raw activity; one occurrence per planned run.
    expect(audit.projection.activities).toBe(3);
    expect(audit.projection.enduranceOccurrences).toBe(4);
    expect(audit.projection.loggedResolutions).toBe(1);
    expect(audit.projection.legacyCompletedResolutions).toBe(0);
  });

  it("does not block on the legacy conditions the policy resolves on its own", async () => {
    const user = await t.createAuthUser("notes@example.test");
    const account = await seedLegacyAccount(t.db, user);
    await seedLegacyCompletionWithoutRun(t.db, account, {
      cycleIndex: 2,
      dayIndex: 2,
      occurredOn: "2026-09-16",
    });

    const audit = await auditMultisport(t.db, { userId: account.userId });

    const categories = audit.issues.map((issue) => issue.category);
    // An unconfirmed effort and a completion with no raw run are both mapped deterministically.
    expect(categories).toContain("legacy_unconfirmed_effort");
    expect(categories).toContain("legacy_completion_without_run");
    expect(audit.projection.legacyCompletedResolutions).toBe(1);
    expect(audit.blocked).toBe(false);
  });

  it("writes nothing: every row count is the same afterwards", async () => {
    const user = await t.createAuthUser("readonly@example.test");
    const account = await seedLegacyAccount(t.db, user);
    const before = await t.db.execute(sql`
      select (select count(*) from public.runs) as runs,
             (select count(*) from public.program_slot_events) as events,
             (select count(*) from public.shared_session_stats) as shared`);

    await auditMultisport(t.db, { userId: account.userId, detail: true });

    const after = await t.db.execute(sql`
      select (select count(*) from public.runs) as runs,
             (select count(*) from public.program_slot_events) as events,
             (select count(*) from public.shared_session_stats) as shared`);
    expect(after.rows).toEqual(before.rows);
  });
});

describe("ambiguous history", () => {
  it("blocks on two raw runs claiming one plan", async () => {
    const user = await t.createAuthUser("dupes@example.test");
    const account = await seedLegacyAccount(t.db, user);
    await seedDuplicatePlannedRun(t.db, account, account.programRunIds[0]!);

    const audit = await auditMultisport(t.db, { userId: account.userId });

    const duplicates = audit.issues.find((issue) => issue.category === "planned_run_duplicates");
    expect(duplicates).toMatchObject({ count: 1, blocking: true });
    expect(audit.blocked).toBe(true);
  });

  it("blocks on a link into another account and never names the other owner's data", async () => {
    const owner = await t.createAuthUser("owner@example.test");
    const stranger = await t.createAuthUser("stranger@example.test");
    const account = await seedLegacyAccount(t.db, owner);
    const other = await seedLegacyAccount(t.db, stranger);
    const runId = await seedCrossOwnerPlannedRun(t.db, account, other.programRunIds[0]!);

    const audit = await auditMultisport(t.db, { userId: account.userId, detail: true });

    const crossOwner = audit.issues.find((issue) => issue.category === "cross_owner_run_planned");
    expect(crossOwner).toMatchObject({ count: 1, blocking: true });
    expect(crossOwner?.references?.[0]).toMatchObject({ userId: account.userId, id: runId });
    // The other account's audit is unaffected: its own records are intact.
    const theirs = await auditMultisport(t.db, { userId: other.userId });
    expect(theirs.issues.some((issue) => issue.category.startsWith("cross_owner"))).toBe(false);
  });

  it("blocks on a completion event whose run has been deleted", async () => {
    const user = await t.createAuthUser("orphan@example.test");
    const account = await seedLegacyAccount(t.db, user);
    // A run removed after its event was written: the schema permits it, no FK holds it.
    await t.db.execute(sql`delete from public.runs where id = ${account.runIds[0]!}`);

    const audit = await auditMultisport(t.db, { userId: account.userId });

    expect(audit.issues.find((issue) => issue.category === "slot_event_orphan_run")).toMatchObject({
      count: 1,
      blocking: true,
    });
    // The shared projection is left without a source too; both have to be reconciled.
    expect(
      audit.issues.find((issue) => issue.category === "shared_stat_missing_source"),
    ).toMatchObject({ count: 1, blocking: true });
    expect(audit.blocked).toBe(true);
  });
});

describe("the report", () => {
  it("carries counts and categories, not measurements or notes", async () => {
    const user = await t.createAuthUser("report@example.test");
    const account = await seedLegacyAccount(t.db, user);
    await seedDuplicatePlannedRun(t.db, account, account.programRunIds[0]!);

    const text = formatAudit(await auditMultisport(t.db, { userId: account.userId, detail: true }));

    expect(text).toContain("planned_run_duplicates");
    expect(text).toContain("Result: BLOCKED");
    // The fixture's private text never reaches the aggregate report.
    expect(text).not.toContain("Felt easy.");
    expect(text).not.toContain("Conversational.");
  });

  it("covers every account when no owner is given", async () => {
    const first = await t.createAuthUser("one@example.test");
    const second = await t.createAuthUser("two@example.test");
    await seedLegacyAccount(t.db, first);
    await seedLegacyAccount(t.db, second, { logAdHocRun: false });

    const audit = await auditMultisport(t.db);

    expect(audit.userId).toBeNull();
    expect(audit.counts.profiles).toBe(2);
    expect(audit.counts.runs).toBe(3);
  });
});
