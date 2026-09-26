import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { backfillMultisport } from "@/db/backfill-multisport";
import {
  activities,
  gyms,
  occurrenceVersions,
  plannedOccurrences,
  profiles,
  runningActivityDetails,
} from "@/db/schema";
import { seedLegacyAccount, type LegacyAccount } from "@/db/test/multisport-fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import {
  AD_HOC_ORIGIN,
  plannedOrigin,
  reportedEffort,
  UNKNOWN_EFFORT,
  type LogOrigin,
} from "@/domain/activity";
import { nativeDistance } from "@/domain/activity-metrics";
import { trainingAnalytics } from "@/domain/analytics";
import { outstanding } from "@/domain/occurrences";
import { fromDateTimeLocal } from "@/lib/time";
import { parseDateRange } from "@/server/validation/date-range";
import { readActivityTotals } from "./activity-analytics";
import { createActivity, type SaveActivityInput } from "./activities";
import { readHistory } from "./history";
import { standaloneSchedule } from "./occurrences";
import { readRunActivities, readTrainingData } from "./training-data";
import { readWeeklyTrainingVolume } from "./training-volume";

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
    origin?: LogOrigin;
  } = {},
): SaveActivityInput {
  const occurredOn = overrides.occurredOn ?? "2026-09-08";
  return {
    submissionKey: crypto.randomUUID(),
    origin: overrides.origin ?? AD_HOC_ORIGIN,
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
    // A save derives the local date from the instant, so a fixture that states one states
    // both. Passing `startedAt` on its own is how the tests below put the two out of step
    // deliberately.
    startedAt: overrides.startedAt ?? fromDateTimeLocal(`${occurredOn}T06:30`, ZONE)!,
    recordedTimeZone: ZONE,
    timeZoneSource: "profile_at_entry",
    occurredOn,
    effort: overrides.effort ?? reportedEffort(3),
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
      effort: { status: "reported", value: 3 },
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

    const coachWeeks = await withUser(t.db, alice.id, (tx) =>
      readWeeklyTrainingVolume(tx, alice.id, "UTC", new Date("2026-09-08T12:00:00Z"), 1),
    );
    expect(coachWeeks).toHaveLength(1);
    expect(coachWeeks[0]).toMatchObject({
      weekStart: "2026-09-07",
      running: { runs: 1, km: 5, minutes: 30 },
    });
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

/**
 * The same journey a real account took, seeded rather than asserted about.
 *
 * `seedLegacyAccount` writes what the database held before the cutover — a mixed programme,
 * a planned run, an ad hoc treadmill run whose RPE nobody confirmed, a finished session —
 * and `backfillMultisport` is the pass every production build runs over it. Only then is a
 * run logged the way the app logs one today. Anything these two eras disagree about is a
 * disagreement an athlete would see on their own screens.
 */
describe("an account that trained before the cutover and logged a run today", () => {
  const TODAY = "2026-09-21";

  async function migrated(): Promise<LegacyAccount> {
    const user = await t.createAuthUser("cutover@example.test");
    const account = await seedLegacyAccount(t.db, user);
    const summary = await backfillMultisport(t.db, { userId: account.userId });
    // Nothing held back: a blocked account would leave its runs unmigrated, and every
    // assertion below about migrated history would then be vacuously true.
    expect(summary).toMatchObject({ accounts: 1, blockedAccounts: 0, runActivities: 2 });
    return account;
  }

  /** What `scheduleActivityAction` writes when you put a session on the calendar yourself. */
  async function scheduleStandaloneRun(userId: string, scheduledOn: string): Promise<string> {
    return withUser(t.db, userId, async (tx) => {
      const [occurrence] = await tx
        .insert(plannedOccurrences)
        .values({ userId, sport: "running", familyId: null, disposition: "pending" })
        .returning({ id: plannedOccurrences.id });
      const [version] = await tx
        .insert(occurrenceVersions)
        .values({
          occurrenceId: occurrence!.id,
          userId,
          sport: "running",
          scheduledOn,
          schedulingZone: ZONE,
        })
        .returning({ id: occurrenceVersions.id });
      await tx
        .update(plannedOccurrences)
        .set({ currentRevisionId: version!.id })
        .where(eq(plannedOccurrences.id, occurrence!.id));
      return occurrence!.id;
    });
  }

  it("keeps every run the backfill migrated and adds the one logged since", async () => {
    const account = await migrated();
    await withUser(t.db, account.userId, (tx) =>
      createActivity(tx, account.userId, run({ occurredOn: TODAY, km: 3.5 })),
    );

    const history = await withUser(t.db, account.userId, (tx) =>
      readHistory(tx, account.userId, range),
    );

    expect(history.runs.map((r) => r.occurredOn)).toEqual([TODAY, "2026-09-11", "2026-09-09"]);
    // The migrated pair arrive with their own provenance, not flattened into the new one.
    // Their numbers move, though: `runs.rpe` was written out of ten and the canonical column
    // is out of five, so the seeded 5 and 4 arrive as 2 and 2. Provenance is what the
    // migration must not touch, and does not.
    expect(history.runs[1]).toMatchObject({
      environment: "treadmill",
      distanceMeters: 4000,
      effort: { status: "legacy_unconfirmed", value: 2 },
    });
    expect(history.runs[2]).toMatchObject({
      environment: "outdoor",
      distanceMeters: 5000,
      effort: { status: "reported", value: 2 },
      notes: "Felt easy.",
    });
    // Its id survived migration, so a link written before the cutover still opens it.
    expect(history.runs[2]?.id).toBe(account.runIds[0]);
    // The session the same fixture finished is still there beside them.
    expect(history.workouts).toHaveLength(1);
  });

  it("gives Progress one answer about how many runs there were, not two", async () => {
    const account = await migrated();
    await withUser(t.db, account.userId, (tx) =>
      createActivity(tx, account.userId, run({ occurredOn: TODAY, km: 3.5 })),
    );

    const [data, totals] = await withUser(t.db, account.userId, (tx) =>
      Promise.all([
        readTrainingData(tx, account.userId, range),
        readActivityTotals(tx, account.userId, { from: range.from, to: range.to }),
      ]),
    );
    const progress = trainingAnalytics(data, ZONE, range.from, range.to);
    const bySport = totals.bySport.find((total) => total.sport === "running")!;

    // The Runs tile and the By sport card, which is the pair that disagreed on screen.
    expect(progress.runs).toBe(3);
    expect(bySport.count).toBe(3);
    expect(bySport.distanceMetres).toBe(12500);
    expect(progress.weeks.reduce((km, week) => km + week.runKm, 0)).toBe(12.5);
    expect(progress.pace.map((point) => point.mode)).toEqual(["outdoor", "treadmill", "outdoor"]);
    // A day with a run and nothing else still counts once, across both eras.
    expect(progress.trainingDays).toBe(4);
  });

  it("stops owing a session you scheduled yourself once you log it", async () => {
    const account = await migrated();
    const occurrenceId = await scheduleStandaloneRun(account.userId, TODAY);

    const before = await withUser(t.db, account.userId, (tx) =>
      standaloneSchedule(tx, account.userId, TODAY),
    );
    expect(outstanding(before.upcoming)).toHaveLength(1);
    // The programme's own four runs are not standalone and are counted by neither number.
    expect(before.upcoming.every((occurrence) => occurrence.familyId === null)).toBe(true);

    const revisionId = before.upcoming[0]!.revisionId;
    const logged = await withUser(t.db, account.userId, (tx) =>
      createActivity(
        tx,
        account.userId,
        run({ occurredOn: TODAY, km: 3.5, origin: plannedOrigin(occurrenceId, revisionId) }),
      ),
    );

    const after = await withUser(t.db, account.userId, (tx) =>
      standaloneSchedule(tx, account.userId, TODAY),
    );
    // Still on the calendar, and no longer work the Training tab asks for.
    expect(after.upcoming).toHaveLength(1);
    expect(after.upcoming[0]?.resolution).toMatchObject({ kind: "logged", activityId: logged.id });
    expect(outstanding(after.upcoming)).toHaveLength(0);
    expect(outstanding(after.earlier)).toHaveLength(0);

    const history = await withUser(t.db, account.userId, (tx) =>
      readHistory(tx, account.userId, range),
    );
    expect(history.runs.map((r) => r.id)).toContain(logged.id);
  });
});
