import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  historyClock,
  LATEST_COUNT,
  latestItems,
} from "@/app/(app)/progress/history/history-items";
import { exercises, gyms, setLogs, workoutExercises, workoutSessions } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { AD_HOC_ORIGIN, reportedEffort } from "@/domain/activity";
import { nativeDistance } from "@/domain/activity-metrics";
import { EARLIEST_DAY } from "@/domain/graph-range";
import { dateWindow, parseDateRange } from "@/server/validation/date-range";
import { createActivity, type SaveActivityInput } from "./activities";
import { readHistoryWorkouts, readLatestActivities } from "./history";
import { readWorkouts } from "./training-data";

let t: TestDatabase;
let alice: { id: string };
let bob: { id: string };
const range = parseDateRange({ from: "2026-09-01", to: "2026-09-02" }, "Asia/Kolkata");

beforeAll(async () => {
  t = await createTestDatabase();
  alice = await t.createAuthUser("history@example.test");
  bob = await t.createAuthUser("other-history@example.test");
  const [exercise] = await t.db
    .insert(exercises)
    .values({
      name: "Test squat",
      slug: "test-squat",
      category: "strength",
      modality: "barbell",
      movementPattern: "squat",
      primaryMuscles: ["quads"],
      loadPortability: "global",
    })
    .returning();
  for (const user of [alice, bob]) {
    await withUser(t.db, user.id, async (tx) => {
      const [gym] = await tx
        .insert(gyms)
        .values({ userId: user.id, name: "Test gym", slug: "test-gym" })
        .returning();
      for (const startedAt of [
        new Date("2026-08-31T18:30:00Z"), // first instant of September in this zone
        new Date("2026-09-01T18:30:00Z"),
        new Date("2026-09-02T18:30:00Z"), // exclusive end: must not appear
      ]) {
        const [session] = await tx
          .insert(workoutSessions)
          .values({
            userId: user.id,
            gymId: gym!.id,
            startedAt,
            completedAt: new Date(startedAt.getTime() + 60_000),
            sleepHours: 7,
          })
          .returning();
        const [slot] = await tx
          .insert(workoutExercises)
          .values({
            userId: user.id,
            workoutSessionId: session!.id,
            exerciseId: exercise!.id,
            orderIndex: 1,
          })
          .returning();
        await tx.insert(setLogs).values(
          ["warmup", "working"].map((setType, i) => ({
            userId: user.id,
            workoutExerciseId: slot!.id,
            setIndex: i + 1,
            setType: setType as "warmup" | "working",
            weight: 40,
            reps: 5,
            rir: 2,
            unit: "kg" as const,
          })),
        );
      }
      // An open session is newer than every completed record in the range.
      await tx
        .insert(workoutSessions)
        .values({ userId: user.id, gymId: gym!.id, startedAt: new Date("2026-09-02T12:00:00Z") });
    });
  }
});
afterAll(async () => {
  await t?.close();
});

describe("history projection", () => {
  it("preserves completed-workout labels, ordering, recovery and counts including warm-ups", async () => {
    const [summary, full] = await withUser(t.db, alice.id, (tx) =>
      Promise.all([readHistoryWorkouts(tx, alice.id, range), readWorkouts(tx, alice.id, range)]),
    );
    expect(summary.workouts).toEqual(
      full.workouts
        .filter((w) => w.completedAt)
        .map((w) => ({
          id: w.id,
          startedAt: w.startedAt,
          gymId: w.gymId,
          gymName: w.gym.name,
          dayName: w.day?.name ?? null,
          sleepHours: w.sleepHours,
          setCount: w.exercises.reduce((n, e) => n + e.sets.length, 0),
          exercises: w.exercises.map((e) => ({
            exerciseId: e.exerciseId,
            name: e.exercise.name,
            machineId: e.equipment?.id ?? null,
            machineName: e.equipment?.name ?? null,
          })),
        })),
    );
    expect(summary.workouts).toHaveLength(2);
    expect(summary.workouts[0]?.setCount).toBe(2);
  });

  it("applies the limit after excluding open sessions and reports truncation", async () => {
    const summary = await withUser(t.db, alice.id, (tx) =>
      readHistoryWorkouts(tx, alice.id, range, 1),
    );
    expect(summary.workouts).toHaveLength(1);
    expect(summary.hasMore).toBe(true);
    expect(summary.workouts[0]?.startedAt.toISOString()).toBe("2026-09-01T18:30:00.000Z");
  });

  it("keeps the owner policy active, including the correlated set/exercise reads", async () => {
    const wrongOwner = await withUser(t.db, bob.id, (tx) =>
      readHistoryWorkouts(tx, alice.id, range),
    );
    expect(wrongOwner.workouts).toEqual([]);
    const [foreignSlot] = await t.db
      .select()
      .from(workoutExercises)
      .where(eq(workoutExercises.userId, bob.id));
    const summary = await withUser(t.db, alice.id, (tx) =>
      readHistoryWorkouts(tx, alice.id, range),
    );
    expect(summary.workouts.every((w) => w.id !== foreignSlot?.workoutSessionId)).toBe(true);
  });
});

/** A run or a ride, logged at 06:00 UTC on `date`. */
function logged(sport: "running" | "cycling", date: string): SaveActivityInput {
  const distance = nativeDistance(5, "km");
  return {
    submissionKey: crypto.randomUUID(),
    origin: AD_HOC_ORIGIN,
    actual:
      sport === "running"
        ? {
            sport,
            environment: "outdoor",
            distance,
            durationMs: 1_800_000,
            surface: null,
            elevationGainMetres: null,
            treadmillInclinePercent: null,
            averageHeartRate: null,
            maxHeartRate: null,
            cadenceStepsPerMinute: null,
          }
        : {
            sport,
            environment: "outdoor",
            durationMs: 1_800_000,
            distance,
            assistance: "unassisted",
            resourceId: null,
            averagePowerWatts: null,
            averageCadenceRpm: null,
            averageHeartRate: null,
            maxHeartRate: null,
            elevationGainMetres: null,
          },
    startedAt: new Date(`${date}T06:00:00Z`),
    recordedTimeZone: "UTC",
    timeZoneSource: "profile_at_entry",
    occurredOn: date,
    effort: reportedEffort(3),
    outcome: "logged",
    title: null,
    notes: null,
  };
}

describe("Overview's latest (ADR 0045)", () => {
  it("lists the newest ten of every sport together, newest first, and no one else's", async () => {
    const carol = await t.createAuthUser("latest@example.test");
    const dan = await t.createAuthUser("latest-other@example.test");
    await withUser(t.db, carol.id, async (tx) => {
      const [gym] = await tx
        .insert(gyms)
        .values({ userId: carol.id, name: "Test gym", slug: "test-gym" })
        .returning();
      // Twelve workouts, one an evening from 1 to 12 September: more than a list of ten holds.
      for (let day = 1; day <= 12; day += 1) {
        const startedAt = new Date(`2026-09-${String(day).padStart(2, "0")}T18:30:00Z`);
        await tx.insert(workoutSessions).values({
          userId: carol.id,
          gymId: gym!.id,
          startedAt,
          completedAt: new Date(startedAt.getTime() + 3_600_000),
        });
      }
      // A session still open is newer than everything, and is not history yet.
      await tx
        .insert(workoutSessions)
        .values({ userId: carol.id, gymId: gym!.id, startedAt: new Date("2026-09-15T18:30:00Z") });
      for (const date of ["2026-09-10", "2026-09-11", "2026-09-13"])
        await createActivity(tx, carol.id, logged("running", date));
      await createActivity(tx, carol.id, logged("cycling", "2026-09-14"));
    });
    await withUser(t.db, dan.id, (tx) =>
      createActivity(tx, dan.id, logged("running", "2026-09-16")),
    );

    const read = await withUser(
      t.db,
      carol.id,
      (tx) => readLatestActivities(tx, carol.id, dateWindow(EARLIEST_DAY, "2026-09-30", "UTC"), 10),
      { readOnly: true },
    );
    // Each sport is read ten deep, so the newest ten of them all are among what came back.
    expect(read.workouts).toHaveLength(10);
    expect(read.runs).toHaveLength(3);
    expect(read.endurance).toHaveLength(1);

    const latest = latestItems(read, historyClock("UTC"));
    expect(LATEST_COUNT).toBe(10);
    expect(latest.map((item) => `${item.kind} ${item.day}`)).toEqual([
      "cycling 2026-09-14",
      "run 2026-09-13",
      "workout 2026-09-12",
      // The evening's workout after that morning's run.
      "workout 2026-09-11",
      "run 2026-09-11",
      "workout 2026-09-10",
      "run 2026-09-10",
      "workout 2026-09-09",
      "workout 2026-09-08",
      "workout 2026-09-07",
    ]);
  });
});
