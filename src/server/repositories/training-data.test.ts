import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { activities, gyms, profiles, runningActivityDetails } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { AD_HOC_ORIGIN, reportedEffort, UNKNOWN_EFFORT } from "@/domain/activity";
import { nativeDistance } from "@/domain/activity-metrics";
import { trainingAnalytics } from "@/domain/analytics";
import { parseDateRange } from "@/server/validation/date-range";
import { createActivity, type SaveActivityInput } from "./activities";
import { readHistory } from "./history";
import { readRunActivities, readTrainingData } from "./training-data";

/**
 * A run the athlete logged has to be a run the athlete can see.
 *
 * The screens read the canonical activity, because that is the only place a run has been
 * written since the multisport cutover. Reading `runs` instead was the defect these guard:
 * History showed a workout and no run, Progress counted "Runs 0" beside a By sport card
 * that said one running session, and the athlete had logged one an hour earlier.
 */

const ZONE = "Asia/Kolkata";
const range = parseDateRange({ from: "2026-09-01", to: "2026-09-30" }, ZONE);

let t: TestDatabase;
let alice: { id: string };
let bob: { id: string };

beforeEach(async () => {
  t = await createTestDatabase();
  alice = await t.createAuthUser("runs@example.test");
  bob = await t.createAuthUser("other-runs@example.test");
  for (const user of [alice, bob])
    await withUser(t.db, user.id, (tx) =>
      tx.update(profiles).set({ timeZone: ZONE }).where(eq(profiles.id, user.id)),
    );
});
afterEach(async () => {
  await t.close();
});

function run(
  overrides: {
    startedAt?: Date;
    occurredOn?: string;
    km?: number;
    durationMs?: number;
    environment?: "outdoor" | "treadmill";
    effort?: SaveActivityInput["effort"];
  } = {},
): SaveActivityInput {
  return {
    submissionKey: crypto.randomUUID(),
    origin: AD_HOC_ORIGIN,
    actual: {
      sport: "running",
      environment: overrides.environment ?? "outdoor",
      distance: nativeDistance(overrides.km ?? 5, "km"),
      durationMs: overrides.durationMs ?? 1_800_000,
      surface: null,
      elevationGainMetres: null,
      treadmillInclinePercent: null,
      averageHeartRate: null,
      maxHeartRate: null,
      cadenceStepsPerMinute: null,
    },
    startedAt: overrides.startedAt ?? new Date("2026-09-08T10:30:00Z"),
    recordedTimeZone: ZONE,
    timeZoneSource: "profile_at_entry",
    occurredOn: overrides.occurredOn ?? "2026-09-08",
    effort: overrides.effort ?? reportedEffort(6),
    outcome: "logged",
    title: null,
    notes: null,
  };
}

describe("the runs an athlete's own screens read", () => {
  it("shows a run logged since the cutover in History and counts it on Progress", async () => {
    const saved = await withUser(t.db, alice.id, (tx) => createActivity(tx, alice.id, run()));
    const [history, data] = await withUser(t.db, alice.id, (tx) =>
      Promise.all([readHistory(tx, alice.id, range), readTrainingData(tx, alice.id, range)]),
    );

    expect(history.runs).toHaveLength(1);
    expect(history.runs[0]).toMatchObject({
      id: saved.id,
      occurredOn: "2026-09-08",
      environment: "outdoor",
      durationSeconds: 1800,
      distanceMeters: 5000,
      averagePaceSecondsPerKm: 360,
      effort: { status: "reported", value: 6 },
    });

    const progress = trainingAnalytics(data, ZONE, range.from, range.to);
    expect(progress.runs).toBe(1);
    expect(progress.trainingDays).toBe(1);
    expect(progress.weeks.find((w) => w.date === "2026-09-07")).toMatchObject({
      runs: 1,
      runKm: 5,
      runMinutes: 30,
    });
    expect(progress.pace).toEqual([{ date: "2026-09-08", value: 6, mode: "outdoor" }]);
  });

  it("reads a migrated run too, with the effort nobody confirmed left unconfirmed", async () => {
    // What the backfill writes for a row of the old `runs` table: the same identifier, the
    // gym it pointed at, and an RPE that was never confirmed as the athlete's own (LOG-03).
    const gymId = await withUser(t.db, alice.id, async (tx) => {
      const [gym] = await tx
        .insert(gyms)
        .values({ userId: alice.id, name: "Outdoor", slug: "outdoor" })
        .returning();
      const [activity] = await tx
        .insert(activities)
        .values({
          userId: alice.id,
          sport: "running",
          status: "completed",
          outcome: "logged",
          startedAt: new Date("2026-09-09T01:00:00Z"),
          recordedTimeZone: ZONE,
          timeZoneSource: "legacy_profile_snapshot",
          occurredOn: "2026-09-09",
          durationMs: 1_985_000,
          effortValue: 3.5,
          effortStatus: "legacy_unconfirmed",
          sourceKind: "legacy_manual",
        })
        .returning({ id: activities.id });
      await tx.insert(runningActivityDetails).values({
        activityId: activity!.id,
        userId: alice.id,
        sport: "running",
        environment: "treadmill",
        distanceMetres: 5000,
        distanceNativeValue: 5000,
        distanceNativeUnit: "m",
        legacyGymId: gym!.id,
      });
      return gym!.id;
    });

    const { runs } = await withUser(t.db, alice.id, (tx) => readRunActivities(tx, alice.id, range));
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      environment: "treadmill",
      effort: { status: "legacy_unconfirmed", value: 3.5 },
      // Kept so History's gym filter still finds a run that named one.
      gymId,
    });
  });

  it("counts a run on the day it happened, not on a date recomputed from the instant", async () => {
    // Saved just after midnight in Kolkata, which is still the previous evening in UTC. The
    // date frozen at save is the athlete's Monday, and moving zone afterwards cannot walk it
    // back into the week before.
    await withUser(t.db, alice.id, (tx) =>
      createActivity(
        tx,
        alice.id,
        run({ startedAt: new Date("2026-09-06T20:00:00Z"), occurredOn: "2026-09-07" }),
      ),
    );
    const data = await withUser(t.db, alice.id, (tx) => readTrainingData(tx, alice.id, range));
    const moved = trainingAnalytics(data, "UTC", range.from, range.to);

    expect(moved.weeks.find((w) => w.date === "2026-09-07")?.runs).toBe(1);
    expect(moved.weeks.find((w) => w.date === "2026-08-31")?.runs).toBe(0);
    expect(moved.pace[0]?.date).toBe("2026-09-07");
  });

  it("leaves out a run outside the range and every run another account owns", async () => {
    await withUser(t.db, alice.id, async (tx) => {
      await createActivity(tx, alice.id, run({ occurredOn: "2026-10-01" }));
      await createActivity(tx, alice.id, run({ effort: UNKNOWN_EFFORT }));
    });
    await withUser(t.db, bob.id, (tx) => createActivity(tx, bob.id, run()));

    const mine = await withUser(t.db, alice.id, (tx) => readRunActivities(tx, alice.id, range));
    expect(mine.runs).toHaveLength(1);
    expect(mine.runs[0]?.effort).toEqual({ status: "unknown", value: null });

    const foreign = await withUser(t.db, bob.id, (tx) => readRunActivities(tx, alice.id, range));
    expect(foreign.runs).toEqual([]);
  });

  it("reports truncation rather than passing a display cap off as everything", async () => {
    await withUser(t.db, alice.id, async (tx) => {
      for (const day of ["2026-09-10", "2026-09-11", "2026-09-12"])
        await createActivity(tx, alice.id, run({ occurredOn: day }));
    });
    const page = await withUser(t.db, alice.id, (tx) =>
      readRunActivities(tx, alice.id, range, 0, 2),
    );
    expect(page.runs).toHaveLength(2);
    expect(page.hasMore).toBe(true);
  });
});
