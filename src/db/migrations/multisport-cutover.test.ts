import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { backfillMultisport, reconcileMultisport } from "@/db/backfill-multisport";
import {
  abortIsStillSafe,
  cutoverAssertions,
  CUTOVER_MARKERS,
  markerAt,
  readMarkers,
  recordMarker,
} from "@/db/multisport-cutover";
import { activities, runs } from "@/db/schema";
import { seedLegacyAccount } from "@/db/test/multisport-fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { validateMultisport } from "@/db/validate-multisport";
import { withUser } from "@/db/with-user";
import { AD_HOC_ORIGIN, reportedEffort } from "@/domain/activity";
import { nativeDistance } from "@/domain/activity-metrics";
import {
  canTransition,
  enabledSports,
  multisportRollout,
  stageOf,
  stageProblems,
  transitionProblem,
} from "@/lib/multisport-rollout";
import { createActivity } from "@/server/repositories/activities";

/**
 * AT-MIG-12/13 and AT-REL: the ordered cutover, rehearsed against a real database.
 *
 * The sequence is the safety argument, so this walks it rather than asserting about it:
 * bridge, backfill, reconcile, pause, validate, switch — and at each step, what is true about
 * the data and what may still be undone. The two claims that matter are the ones §10.4 names
 * by name: no new sport is written before the switch, and no legacy writer survives it.
 */

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
  vi.unstubAllEnvs();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await t.close();
});

const at = (env: Record<string, string>) => multisportRollout(env);

const ride = () => ({
  submissionKey: crypto.randomUUID(),
  origin: AD_HOC_ORIGIN,
  actual: {
    sport: "cycling" as const,
    environment: "outdoor" as const,
    durationMs: 1_800_000,
    distance: nativeDistance(20, "km"),
    assistance: "unassisted" as const,
    resourceId: null,
    averagePowerWatts: null,
    averageCadenceRpm: null,
    averageHeartRate: null,
    maxHeartRate: null,
    elevationGainMetres: null,
  },
  startedAt: new Date("2026-09-19T06:00:00Z"),
  recordedTimeZone: "UTC",
  timeZoneSource: "profile_at_entry" as const,
  occurredOn: "2026-09-19",
  effort: reportedEffort(4),
  outcome: "logged" as const,
  title: null,
  notes: null,
});

describe("the stages of the rollout", () => {
  it("names each stage of the order and refuses combinations outside it", () => {
    expect(stageOf(at({}))).toBe("legacy");
    expect(stageOf(at({ MULTISPORT_SHARED_NAV: "true" }))).toBe("bridge");
    expect(
      stageOf(at({ MULTISPORT_SHARED_NAV: "true", MULTISPORT_CANONICAL_WRITES: "true" })),
    ).toBe("canonical");
    expect(stageOf(at({ MULTISPORT_ROLLOUT: "true" }))).toBe("complete");
  });

  /** A writer with no screen is the mirror of a sport with no writer, and equally refused. */
  it("refuses canonical writes with the shared navigation switched off", () => {
    const capabilities = at({ MULTISPORT_CANONICAL_WRITES: "true" });
    expect(stageOf(capabilities)).toBeNull();
    expect(stageProblems(capabilities).map((problem) => problem.code)).toEqual([
      "writer_without_screens",
    ]);
  });

  it("keeps new sports off until a canonical writer exists", () => {
    const capabilities = at({ MULTISPORT_SHARED_NAV: "true", MULTISPORT_NEW_SPORTS: "true" });
    expect(capabilities.newSports).toBe(false);
    expect(enabledSports(capabilities)).toEqual(["strength", "running"]);
    expect(stageProblems(capabilities)).toEqual([]);
  });

  /** AT-MIG-13: before the switch an abort is a flag; after it, it is a rehearsed replay. */
  it("allows an abort back to the bridge and refuses one after the switch", () => {
    expect(canTransition("bridge", "legacy")).toBe(true);
    expect(canTransition("bridge", "canonical")).toBe(true);
    expect(canTransition("legacy", "canonical")).toBe(false);
    expect(canTransition("canonical", "bridge")).toBe(false);
    expect(transitionProblem("canonical", "bridge")).toContain("rehearsed recovery");
    expect(transitionProblem("legacy", "complete")).toContain("does not go from");
  });
});

describe("the ordered cutover, rehearsed", () => {
  /**
   * AT-MIG-12: the whole sequence, and what is true at each point.
   *
   * Written as one test on purpose. The steps are only meaningful in order, and splitting
   * them into six would let each one pass against a database the previous step never touched.
   */
  it("walks bridge, backfill, pause, validate and switch", async () => {
    const user = await t.createAuthUser("cutover@example.test");
    const account = await seedLegacyAccount(t.db, user);

    // Step 2: the bridge. Legacy is still the writer; nothing canonical-only exists.
    expect(stageOf(at({ MULTISPORT_SHARED_NAV: "true" }))).toBe("bridge");
    expect((await abortIsStillSafe(t.db)).safe).toBe(true);

    // Step 3: the backfill, then reconciliation.
    await backfillMultisport(t.db, { userId: account.userId });
    const reconciliation = await reconcileMultisport(t.db);
    expect(reconciliation.ok).toBe(true);
    // Re-running adds nothing (AT-MIG-08).
    await backfillMultisport(t.db, { userId: account.userId });
    expect((await reconcileMultisport(t.db)).ok).toBe(true);

    // Step 5: the write pause. Recorded so the window is a fact rather than a memory.
    await recordMarker(t.db, CUTOVER_MARKERS.writePauseStarted);
    expect(await markerAt(t.db, CUTOVER_MARKERS.writePauseStarted)).not.toBeNull();

    // Step 6: M2. It is the last thing that can abort the cutover cheaply.
    const validation = await validateMultisport(t.db);
    expect(validation.applied).toBe(true);
    expect((await abortIsStillSafe(t.db)).safe).toBe(true);

    // Step 7: authority moves, and is recorded.
    await recordMarker(t.db, CUTOVER_MARKERS.authoritySwitched);
    const assertions = await cutoverAssertions(t.db);
    expect(assertions.every((assertion) => assertion.ok)).toBe(true);
    expect(assertions.map((assertion) => assertion.name)).toContain(
      "no legacy run was written after the switch",
    );

    // And afterwards, an abort is no longer a flag change.
    const abort = await abortIsStillSafe(t.db);
    expect(abort.safe).toBe(false);
    expect(abort.reason).toContain("rehearsed replay");

    const markers = await readMarkers(t.db);
    expect(markers.map((marker) => marker.name)).toEqual([
      CUTOVER_MARKERS.writePauseStarted,
      CUTOVER_MARKERS.authoritySwitched,
    ]);
  });

  /** AT-MIG-12: a ride written before the switch is data an abort would lose. */
  it("notices a new-sport write that predates the switch", async () => {
    const user = await t.createAuthUser("early-ride@example.test");
    await withUser(t.db, user.id, (tx) => createActivity(tx, user.id, ride()));

    const assertions = await cutoverAssertions(t.db);
    const early = assertions.find((assertion) => assertion.name.includes("new-sport"));
    expect(early?.ok).toBe(false);
    expect(early?.detail).toContain("abort would lose them");
    expect((await abortIsStillSafe(t.db)).safe).toBe(false);
  });

  /** AT-MIG-12: two live writers is the failure the order exists to prevent. */
  it("notices a legacy run written after the switch", async () => {
    const user = await t.createAuthUser("late-run@example.test");
    const account = await seedLegacyAccount(t.db, user);
    await backfillMultisport(t.db, { userId: account.userId });
    await recordMarker(t.db, CUTOVER_MARKERS.authoritySwitched);

    // A minute later, the old writer produces a row it should no longer be producing.
    await t.db.execute(sql`
      insert into public.runs
        (user_id, started_at, mode, distance_meters, duration_seconds, created_at)
      values (${account.userId}, now(), 'outdoor', 5000, 1800, now() + interval '1 minute')
    `);

    const assertions = await cutoverAssertions(t.db);
    const late = assertions.find((assertion) => assertion.name.includes("legacy run"));
    expect(late?.ok).toBe(false);
    expect(late?.detail).toContain("Two writers are live");
  });

  /** AT-REL-04: the release is not complete until the new sports are actually enabled. */
  it("does not call a canonical build complete before its sports are on", async () => {
    const canonical = at({ MULTISPORT_SHARED_NAV: "true", MULTISPORT_CANONICAL_WRITES: "true" });
    expect(stageOf(canonical)).toBe("canonical");
    expect(enabledSports(canonical)).toEqual(["strength", "running"]);
    expect(canTransition("canonical", "complete")).toBe(true);
    const complete = at({ MULTISPORT_ROLLOUT: "true" });
    expect(enabledSports(complete)).toEqual(["strength", "running", "cycling", "swimming"]);
  });
});

describe("what the backfill left behind", () => {
  /** AT-MIG-03: the strength side is not touched, and every run has a parent. */
  it("keeps every legacy row and gives each one a canonical parent", async () => {
    const user = await t.createAuthUser("preserved@example.test");
    const account = await seedLegacyAccount(t.db, user);
    const before = await t.db
      .select({ id: runs.id, distance: runs.distanceMeters, duration: runs.durationSeconds })
      .from(runs)
      .where(eq(runs.userId, account.userId));

    await backfillMultisport(t.db, { userId: account.userId });

    const after = await t.db
      .select({ id: runs.id, distance: runs.distanceMeters, duration: runs.durationSeconds })
      .from(runs)
      .where(eq(runs.userId, account.userId));
    expect(after).toEqual(before);

    const parents = await t.db
      .select({ id: activities.id })
      .from(activities)
      .where(sql`${activities.userId} = ${account.userId} and ${activities.sport} = 'running'`);
    expect(parents.length).toBe(before.length);
  });
});
