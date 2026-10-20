import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { profiles } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { AD_HOC_ORIGIN, reportedEffort } from "@/domain/activity";
import { nativeDistance, type RunningActualV1, type RunningLap } from "@/domain/activity-metrics";
import { ensureProfile, readProfile } from "@/server/queries/profile";

import { createActivity, getActivity } from "./activities";
import { highestRecentRunHeartRate, raiseMaxHeartRateFromRun, readHeartRate } from "./heart-rate";

/**
 * ADR 0059: a run keeps its laps and its kind, the year's runs stand in for a maximum nobody
 * entered, and a run saved with a higher reading raises the stored one — once, upwards only.
 */

let t: TestDatabase;
let user: { id: string; email: string };

const lap = (overrides: Partial<RunningLap> = {}): RunningLap => ({
  phase: "work",
  distance: nativeDistance(800, "m"),
  durationMs: 180_000,
  averageHeartRate: 168,
  maxHeartRate: 176,
  ...overrides,
});

const run = (overrides: Partial<RunningActualV1> = {}): RunningActualV1 => ({
  sport: "running",
  environment: "outdoor",
  distance: nativeDistance(8, "km"),
  durationMs: 2_700_000,
  runType: "intervals",
  surface: "Track",
  elevationGainMetres: null,
  treadmillInclinePercent: null,
  averageHeartRate: 150,
  maxHeartRate: 181,
  cadenceStepsPerMinute: 172,
  laps: [
    lap(),
    lap({
      phase: "recovery",
      distance: null,
      durationMs: 90_000,
      averageHeartRate: 141,
      maxHeartRate: 150,
    }),
  ],
  ...overrides,
});

async function log(actual: RunningActualV1, occurredOn: string) {
  return withUser(t.db, user.id, (tx) =>
    createActivity(tx, user.id, {
      submissionKey: crypto.randomUUID(),
      origin: AD_HOC_ORIGIN,
      actual,
      startedAt: new Date(`${occurredOn}T06:00:00Z`),
      recordedTimeZone: "UTC",
      timeZoneSource: "profile_at_entry",
      occurredOn,
      effort: reportedEffort(4),
      outcome: "logged",
      title: null,
      notes: null,
    }),
  );
}

beforeAll(async () => {
  t = await createTestDatabase();
  user = await t.createAuthUser("zones@example.com");
  await withUser(t.db, user.id, (tx) => ensureProfile(tx, user));
  await t.db.update(profiles).set({ dateOfBirth: "1998-03-01" }).where(eq(profiles.id, user.id));
});

afterAll(async () => {
  await t.close();
});

describe("a run's laps and kind", () => {
  it("are stored with the run and read back as they were entered", async () => {
    const saved = await log(run(), "2026-10-01");
    const record = await withUser(t.db, user.id, (tx) => getActivity(tx, user.id, saved.id));
    expect(record!.actual).toMatchObject({
      runType: "intervals",
      laps: [
        lap(),
        lap({
          phase: "recovery",
          distance: null,
          durationMs: 90_000,
          averageHeartRate: 141,
          maxHeartRate: 150,
        }),
      ],
    });
  });
});

describe("the maximum heart rate in use", () => {
  it("is the best of the age estimate and the year's runs, laps included", async () => {
    await log(run({ maxHeartRate: 185, laps: [lap({ maxHeartRate: 194 })] }), "2026-10-05");
    // A cadence-locked spike no heart reaches is not a maximum.
    await log(run({ maxHeartRate: 240, laps: [] }), "2026-10-06");
    const highest = await withUser(t.db, user.id, (tx) =>
      highestRecentRunHeartRate(tx, user.id, "2026-10-20"),
    );
    expect(highest).toMatchObject({ bpm: 194, on: "2026-10-05" });
    const profile = (await readProfile(t.db, user.id))!;
    const { resolved } = await withUser(t.db, user.id, (tx) =>
      readHeartRate(tx, profile, "2026-10-20"),
    );
    // Age 28 estimates 188; the run's 194 beats it.
    expect(resolved).toMatchObject({ max: 194, basis: "observed", on: "2026-10-05" });
  });

  it("is raised by a run that records more, and only by one that does", async () => {
    const profile = (await readProfile(t.db, user.id))!;
    const before = await withUser(t.db, user.id, (tx) => readHeartRate(tx, profile, "2026-10-20"));
    const lower = await withUser(t.db, user.id, (tx) =>
      raiseMaxHeartRateFromRun(
        tx,
        user.id,
        before,
        run({ maxHeartRate: 190, laps: [] }),
        "2026-10-20",
      ),
    );
    expect(lower).toBeNull();
    const higher = await withUser(t.db, user.id, (tx) =>
      raiseMaxHeartRateFromRun(
        tx,
        user.id,
        before,
        run({ maxHeartRate: 197, laps: [] }),
        "2026-10-20",
      ),
    );
    expect(higher).toBe(197);
    expect(await readProfile(t.db, user.id)).toMatchObject({
      maxHeartRate: 197,
      maxHeartRateSource: "observed",
      maxHeartRateOn: "2026-10-20",
    });
  });

  it("is left alone when the athlete has switched the raising off", async () => {
    await t.db.update(profiles).set({ maxHeartRateAuto: false }).where(eq(profiles.id, user.id));
    const profile = (await readProfile(t.db, user.id))!;
    const before = await withUser(t.db, user.id, (tx) => readHeartRate(tx, profile, "2026-10-21"));
    const raised = await withUser(t.db, user.id, (tx) =>
      raiseMaxHeartRateFromRun(
        tx,
        user.id,
        before,
        run({ maxHeartRate: 205, laps: [] }),
        "2026-10-21",
      ),
    );
    expect(raised).toBeNull();
    expect((await readProfile(t.db, user.id))!.maxHeartRate).toBe(197);
  });

  it("refuses a stored maximum outside what a heart reaches, in the database itself", async () => {
    await expect(
      t.db.update(profiles).set({ maxHeartRate: 250 }).where(eq(profiles.id, user.id)),
    ).rejects.toThrow();
    await expect(
      t.db
        .update(profiles)
        .set({ maxHeartRate: 190, maxHeartRateSource: null })
        .where(eq(profiles.id, user.id)),
    ).rejects.toThrow();
  });
});
