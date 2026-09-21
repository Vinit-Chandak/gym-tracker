import { and, eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { backfillMultisport, reconcileMultisport } from "@/db/backfill-multisport";
import {
  activities,
  multisportMigrationIssues,
  multisportMigrationLinks,
  occurrenceEvents,
  occurrenceVersions,
  plannedOccurrences,
  programSlotEvents,
  runningActivityDetails,
  runs,
  sharedSessionStats,
  userSportPreferences,
  workoutSessions,
} from "@/db/schema";
import {
  seedDuplicatePlannedRun,
  seedLegacyAccount,
  seedLegacyCompletionWithoutRun,
  type LegacyAccount,
} from "@/db/test/multisport-fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";

/**
 * AT-MIG-01 to AT-MIG-09: the real migrations, real legacy rows, and a backfill that has to
 * be repeatable, lossless and unwilling to guess.
 */

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});
afterEach(async () => {
  await t.close();
});

const countOf = async (table: string, where = "true"): Promise<number> => {
  const result = await t.db.execute<{ value: number }>(
    sql.raw(`select count(*)::int as value from public.${table} where ${where}`),
  );
  return Number(result.rows[0]?.value ?? 0);
};

async function seeded(email: string, options = {}): Promise<LegacyAccount> {
  const user = await t.createAuthUser(email);
  return seedLegacyAccount(t.db, user, options);
}

describe("a mixed account", () => {
  it("gives every raw activity one canonical parent and keeps its measurements", async () => {
    const account = await seeded("runner@example.test");

    const summary = await backfillMultisport(t.db, { userId: account.userId });

    expect(summary).toMatchObject({
      accounts: 1,
      blockedAccounts: 0,
      runActivities: 2,
      strengthActivities: 1,
      occurrences: 4,
      revisions: 4,
      resolutions: 1,
    });
    const [planned] = await t.db
      .select()
      .from(activities)
      .where(eq(activities.id, account.runIds[0]!));
    // The run keeps its own id, so stored links and evidence still resolve.
    expect(planned).toMatchObject({ sport: "running", status: "completed", outcome: "logged" });
    expect(planned!.durationMs).toBe(1_800_000);
    expect(planned!.effortStatus).toBe("reported");
    expect(planned!.notes).toBe("Felt easy.");
    const [detail] = await t.db
      .select()
      .from(runningActivityDetails)
      .where(eq(runningActivityDetails.activityId, account.runIds[0]!));
    expect(detail).toMatchObject({
      environment: "outdoor",
      distanceMetres: 5000,
      distanceNativeUnit: "m",
      legacyOutOfBounds: false,
    });
  });

  /** AT-LOG-11 through the migration: an unconfirmed rating stays unconfirmed. */
  it("carries effort provenance over untouched", async () => {
    const account = await seeded("effort@example.test");
    await backfillMultisport(t.db, { userId: account.userId });

    const [adHoc] = await t.db
      .select({ status: activities.effortStatus, value: activities.effortValue })
      .from(activities)
      .where(eq(activities.id, account.runIds[1]!));
    expect(adHoc).toEqual({ status: "legacy_unconfirmed", value: 5 });
  });

  it("adds the strength parent without touching the session's own rows", async () => {
    const account = await seeded("lifter@example.test");
    const before = await t.db.select().from(workoutSessions).where(eq(workoutSessions.userId, account.userId));

    await backfillMultisport(t.db, { userId: account.userId });

    const after = await t.db.select().from(workoutSessions).where(eq(workoutSessions.userId, account.userId));
    expect(after).toHaveLength(before.length);
    expect(after[0]!.id).toBe(before[0]!.id);
    expect(after[0]!.startedAt).toEqual(before[0]!.startedAt);
    expect(after[0]!.gymId).toBe(before[0]!.gymId);
    // The one change is the link up to the parent.
    expect(after[0]!.activityId).toBe(account.workoutSessionIds[0]!);
    const [parent] = await t.db
      .select()
      .from(activities)
      .where(eq(activities.id, account.workoutSessionIds[0]!));
    expect(parent!.sport).toBe("strength");
    // Strength effort belongs to its sets; the parent asserts none.
    expect(parent!.effortStatus).toBe("unknown");
  });

  it("turns each planned run into an occurrence with its own prescription", async () => {
    const account = await seeded("planner@example.test");
    await backfillMultisport(t.db, { userId: account.userId });

    const occurrences = await t.db
      .select()
      .from(plannedOccurrences)
      .where(eq(plannedOccurrences.userId, account.userId));
    expect(occurrences).toHaveLength(4);
    const versions = await t.db
      .select()
      .from(occurrenceVersions)
      .where(eq(occurrenceVersions.userId, account.userId));
    expect(versions).toHaveLength(4);
    // Week 1's Wednesday, from a programme that began Monday 7 September.
    const wednesday = versions.find((version) => version.scheduledOn === "2026-09-09");
    expect(wednesday).toBeDefined();
    expect(wednesday!.prescription).toMatchObject({
      structureSource: "legacy_summary",
      sessionTargets: { durationMs: [1_500_000, 2_100_000], distanceMetres: [4000, 5000] },
      running: { symptomStopRule: "Stop if the knee complains." },
    });
    // Every occurrence points at the revision in force.
    expect(occurrences.every((occurrence) => occurrence.currentRevisionId !== null)).toBe(true);
  });

  it("resolves a completed plan through the activity that fulfilled it", async () => {
    const account = await seeded("resolve@example.test");
    await backfillMultisport(t.db, { userId: account.userId });

    const [logged] = await t.db
      .select({ occurrenceId: activities.occurrenceId, revision: activities.performedRevisionId })
      .from(activities)
      .where(eq(activities.id, account.runIds[0]!));
    expect(logged!.occurrenceId).not.toBeNull();
    expect(logged!.revision).not.toBeNull();
    const events = await t.db
      .select()
      .from(occurrenceEvents)
      .where(
        and(eq(occurrenceEvents.userId, account.userId), eq(occurrenceEvents.kind, "logged")),
      );
    expect(events).toHaveLength(1);
    expect(events[0]!.activityId).toBe(account.runIds[0]!);
    expect(events[0]!.actor).toBe("migration");
  });

  /** AT-MIG-06: a completion with no raw run stays a resolution, not an invented activity. */
  it("records migration 0011's source-less completion without fabricating a run", async () => {
    const account = await seeded("legacy@example.test");
    // Week two's Wednesday run: the day of the cycle that actually runs, in a week nothing
    // was logged for. A completion on a day that carries no run answers for nothing.
    await seedLegacyCompletionWithoutRun(t.db, account, {
      cycleIndex: 2,
      dayIndex: 2,
      occurredOn: "2026-09-16",
    });

    const summary = await backfillMultisport(t.db, { userId: account.userId });

    expect(summary.legacyResolutions).toBe(1);
    const resolved = await t.db
      .select()
      .from(plannedOccurrences)
      .where(
        and(
          eq(plannedOccurrences.userId, account.userId),
          eq(plannedOccurrences.disposition, "legacy_completed"),
        ),
      );
    expect(resolved).toHaveLength(1);
    // Two runs in, two activities out. Nothing was conjured for the event.
    expect(await countOf("activities", `sport = 'running'`)).toBe(2);
    const events = await t.db
      .select()
      .from(occurrenceEvents)
      .where(eq(occurrenceEvents.kind, "legacy_resolved"));
    expect(events[0]!.activityId).toBeNull();
  });

  it("enables the sports this account already trains and leaves the new ones off", async () => {
    const account = await seeded("prefs@example.test");
    await backfillMultisport(t.db, { userId: account.userId });

    const prefs = await t.db
      .select()
      .from(userSportPreferences)
      .where(eq(userSportPreferences.userId, account.userId));
    expect(prefs).toHaveLength(4);
    const bySport = new Map(prefs.map((pref) => [pref.sport, pref]));
    expect(bySport.get("running")).toMatchObject({ enabled: true });
    expect(bySport.get("strength")).toMatchObject({ enabled: true });
    // A migration does not turn on a sport nobody asked for, or open a private category.
    expect(bySport.get("cycling")).toMatchObject({ enabled: false, shareStats: false });
    expect(bySport.get("swimming")).toMatchObject({ enabled: false, shareStats: false });
  });
});

/**
 * The marker a deploy reads to decide whether to run this at all.
 *
 * It has to mean "every account is done", because that is the question the build asks. A pass
 * that skipped an account over a blocking issue, a rehearsal, or a single-account support run
 * are all partial — marking any of them done is how the accounts left behind never get a
 * second chance.
 */
describe("the completion marker", () => {
  const marked = async () => (await countOf("data_backfills", "name = 'multisport_canonical_v1'")) > 0;

  it("records a complete pass, so the next deploy skips it", async () => {
    await seeded("complete@example.test");
    expect(await marked()).toBe(false);

    const summary = await backfillMultisport(t.db);

    expect(summary.blockedAccounts).toBe(0);
    expect(await marked()).toBe(true);
  });

  it("does not record a pass that held an account back", async () => {
    const blocked = await seeded("held@example.test");
    await seedDuplicatePlannedRun(t.db, blocked, blocked.programRunIds[0]!);
    await seeded("fine@example.test");

    const summary = await backfillMultisport(t.db);

    expect(summary).toMatchObject({ accounts: 1, blockedAccounts: 1 });
    expect(await marked()).toBe(false);
  });

  it("does not record a single-account run, nor a dry one", async () => {
    const account = await seeded("one@example.test");
    await backfillMultisport(t.db, { userId: account.userId });
    expect(await marked()).toBe(false);

    await backfillMultisport(t.db, { dryRun: true });
    expect(await marked()).toBe(false);
  });
});

/** AT-MIG-08: running it again, or after an interruption, changes nothing. */
describe("running it twice", () => {
  it("adds no rows and changes no totals", async () => {
    const account = await seeded("again@example.test");
    await backfillMultisport(t.db, { userId: account.userId });
    const first = {
      activities: await countOf("activities"),
      details: await countOf("running_activity_details"),
      occurrences: await countOf("planned_occurrences"),
      versions: await countOf("occurrence_versions"),
      events: await countOf("occurrence_events"),
      links: await countOf("multisport_migration_links"),
    };

    const summary = await backfillMultisport(t.db, { userId: account.userId });

    expect(summary).toMatchObject({
      runActivities: 0,
      strengthActivities: 0,
      occurrences: 0,
      resolutions: 0,
    });
    expect({
      activities: await countOf("activities"),
      details: await countOf("running_activity_details"),
      occurrences: await countOf("planned_occurrences"),
      versions: await countOf("occurrence_versions"),
      events: await countOf("occurrence_events"),
      links: await countOf("multisport_migration_links"),
    }).toEqual(first);
  });

  it("finishes an interrupted run rather than starting over", async () => {
    const account = await seeded("resume@example.test");
    // A run that stopped after the activities and before the occurrences.
    await backfillMultisport(t.db, { userId: account.userId });
    await t.db.delete(occurrenceEvents).where(eq(occurrenceEvents.userId, account.userId));
    await t.db
      .delete(multisportMigrationLinks)
      .where(
        and(
          eq(multisportMigrationLinks.userId, account.userId),
          eq(multisportMigrationLinks.sourceKind, "program_slot_events"),
        ),
      );
    await t.db
      .update(activities)
      .set({ occurrenceId: null, performedRevisionId: null })
      .where(eq(activities.userId, account.userId));

    const summary = await backfillMultisport(t.db, { userId: account.userId });

    expect(summary.resolutions).toBe(1);
    expect(await countOf("activities")).toBe(3);
  });
});

describe("what it refuses to do", () => {
  /** AT-MIG-04: two runs claiming one plan blocks that account and keeps both runs. */
  it("holds an account whose history is ambiguous", async () => {
    const account = await seeded("ambiguous@example.test");
    const second = await seedDuplicatePlannedRun(t.db, account, account.programRunIds[0]!);

    const summary = await backfillMultisport(t.db, { userId: account.userId });

    expect(summary).toMatchObject({ accounts: 0, blockedAccounts: 1 });
    expect(await countOf("activities")).toBe(0);
    // Both raw runs are still there, untouched.
    const raw = await t.db.select().from(runs).where(eq(runs.userId, account.userId));
    expect(raw.map((row) => row.id)).toContain(second);
    const issues = await t.db
      .select()
      .from(multisportMigrationIssues)
      .where(eq(multisportMigrationIssues.userId, account.userId));
    expect(issues.map((issue) => issue.category)).toContain("planned_run_duplicates");
  });

  it("leaves another account's data alone while one is blocked", async () => {
    const blocked = await seeded("blocked@example.test");
    await seedDuplicatePlannedRun(t.db, blocked, blocked.programRunIds[0]!);
    const healthy = await seeded("healthy@example.test");

    const summary = await backfillMultisport(t.db);

    expect(summary).toMatchObject({ accounts: 1, blockedAccounts: 1 });
    expect(await countOf("activities", `user_id = '${healthy.userId}'`)).toBe(3);
    expect(await countOf("activities", `user_id = '${blocked.userId}'`)).toBe(0);
  });

  /** AT-MIG-02: a deliberate id collision is mapped, not overwritten. */
  it("mints an id when a session and a run share one, and records why", async () => {
    const account = await seeded("collide@example.test");
    const runId = account.runIds[0]!;
    const sessionId = account.workoutSessionIds[0]!;
    // Two source tables, one UUID: the schema permits it, so the ledger has to cope. The
    // rows that named the session move with it, so the only anomaly is the collision itself.
    await t.db.update(workoutSessions).set({ id: runId }).where(eq(workoutSessions.id, sessionId));
    await t.db
      .update(programSlotEvents)
      .set({ workoutSessionId: runId })
      .where(eq(programSlotEvents.workoutSessionId, sessionId));
    await t.db
      .update(sharedSessionStats)
      .set({ sourceId: runId })
      .where(eq(sharedSessionStats.sourceId, sessionId));

    await backfillMultisport(t.db, { userId: account.userId });

    const links = await t.db
      .select()
      .from(multisportMigrationLinks)
      .where(
        and(
          eq(multisportMigrationLinks.userId, account.userId),
          eq(multisportMigrationLinks.sourceKind, "workout_sessions"),
        ),
      );
    expect(links).toHaveLength(1);
    expect(links[0]!.reason).toBe("minted");
    expect(links[0]!.targetId).not.toBe(runId);
    // The run kept its own identity; the session's parent is the new one.
    const [run] = await t.db.select().from(activities).where(eq(activities.id, runId));
    expect(run!.sport).toBe("running");
  });
});

describe("reconciliation", () => {
  it("passes on a backfilled account and names what it checked", async () => {
    const account = await seeded("reconcile@example.test");
    await backfillMultisport(t.db, { userId: account.userId });

    const report = await reconcileMultisport(t.db, { userId: account.userId });

    expect(report.ok).toBe(true);
    expect(report.checks.map((check) => check.name)).toContain("one canonical parent per run");
    expect(report.checks.every((check) => check.ok)).toBe(true);
  });

  it("fails when a canonical row is missing rather than reporting its own bookkeeping", async () => {
    const account = await seeded("drift@example.test");
    await backfillMultisport(t.db, { userId: account.userId });
    await t.db.delete(activities).where(eq(activities.id, account.runIds[1]!));

    const report = await reconcileMultisport(t.db, { userId: account.userId });

    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.name === "one canonical parent per run")).toMatchObject(
      { ok: false, expected: 2, actual: 1 },
    );
  });

  it("catches a measurement that no longer matches its source", async () => {
    const account = await seeded("tamper@example.test");
    await backfillMultisport(t.db, { userId: account.userId });
    await t.db
      .update(runningActivityDetails)
      .set({ distanceMetres: 5001 })
      .where(eq(runningActivityDetails.activityId, account.runIds[0]!));

    const report = await reconcileMultisport(t.db, { userId: account.userId });

    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.name === "distances unchanged")?.actual).toBe(1);
  });
});

describe("a dry run", () => {
  it("reports what it would write and writes nothing", async () => {
    const account = await seeded("dry@example.test");

    const summary = await backfillMultisport(t.db, { userId: account.userId, dryRun: true });

    expect(summary).toMatchObject({ dryRun: true, runActivities: 2, occurrences: 4 });
    expect(await countOf("activities")).toBe(0);
    expect(await countOf("planned_occurrences")).toBe(0);
    expect(await countOf("multisport_migration_links")).toBe(0);
  });
});
