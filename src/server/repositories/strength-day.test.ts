import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { historyClock, workoutItem } from "@/app/(app)/progress/history/history-items";
import { exercises, gyms, setLogs, workoutExercises, workoutSessions } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { dateWindow } from "@/server/validation/date-range";

import { readActivityDays } from "./activity-analytics";
import { closeStrengthParent, openStrengthParent } from "./activities";
import { readExerciseLife } from "./exercise-life";
import { readExerciseSeriesOptions, readExerciseSetRows, readStrengthRows } from "./graphs";
import { readHistoryWorkouts } from "./history";
import { readMuscleVolume } from "./muscle-volume";
import { readRecoveryHistory } from "./recovery-history";
import { readWorkouts } from "./training-data";

/**
 * A lift keeps the day it was recorded on (plan §6.3), as a run does: the account below lifted
 * at 21:30 UTC on 30 September while its profile said UTC, then moved to Kolkata, where that
 * instant is 03:00 on 1 October. Every screen still puts it on 30 September, the day the
 * calendar marks; a session older than the parents, which has none, is dated in today's zone.
 */
const now = "Asia/Kolkata";
const lifted = new Date("2026-09-30T21:30:00Z");
const thirtieth = dateWindow("2026-09-30", "2026-09-30", now);
const first = dateWindow("2026-10-01", "2026-10-01", now);

let t: TestDatabase, userId: string, exerciseId: string, recorded: string, legacy: string;

/** A finished workout of one working set, started at `startedAt`. */
async function workout(gymId: string, startedAt: Date) {
  return withUser(t.db, userId, async (tx) => {
    const [session] = await tx
      .insert(workoutSessions)
      .values({
        userId,
        gymId,
        startedAt,
        completedAt: new Date(startedAt.getTime() + 3_600_000),
        sleepHours: 7,
      })
      .returning({ id: workoutSessions.id });
    const [slot] = await tx
      .insert(workoutExercises)
      .values({ userId, workoutSessionId: session!.id, exerciseId, orderIndex: 0 })
      .returning({ id: workoutExercises.id });
    await tx.insert(setLogs).values({
      userId,
      workoutExerciseId: slot!.id,
      setIndex: 0,
      setType: "working",
      weight: 100,
      reps: 5,
      unit: "kg",
    });
    return session!.id;
  });
}

beforeAll(async () => {
  t = await createTestDatabase();
  userId = (await t.createAuthUser("strength-day@example.test")).id;
  const [exercise] = await t.db
    .insert(exercises)
    .values({
      name: "Test squat",
      slug: "test-squat-day",
      category: "strength",
      modality: "barbell",
      movementPattern: "squat",
      primaryMuscles: ["quads"],
      loadPortability: "global",
    })
    .returning();
  exerciseId = exercise!.id;
  const [gym] = await withUser(t.db, userId, (tx) =>
    tx.insert(gyms).values({ userId, name: "Test gym", slug: "test-gym" }).returning(),
  );
  // Opened and finished as the app does, while the profile said UTC.
  recorded = await workout(gym!.id, lifted);
  await withUser(t.db, userId, async (tx) => {
    await openStrengthParent(tx, userId, { id: recorded, startedAt: lifted }, "UTC");
    await closeStrengthParent(tx, userId, recorded, new Date(lifted.getTime() + 3_600_000));
  });
  // A session from before the parents, at the same instant: no frozen day to keep.
  legacy = await workout(gym!.id, lifted);
});
afterAll(async () => {
  await t?.close();
});

const read = <T>(fn: Parameters<typeof withUser<T>>[2]) =>
  withUser(t.db, userId, fn, { readOnly: true });

describe("a lift's day after the profile's zone moves", () => {
  it("is the calendar's day on the day page", async () => {
    const days = await read((tx) => readActivityDays(tx, userId, thirtieth));
    expect(days.items.map((item) => item.id)).toEqual([recorded]);
    const [onThirtieth, onFirst] = await read((tx) =>
      Promise.all([
        readWorkouts(tx, userId, thirtieth, 0, 20, { completedOnly: true, onDays: true }),
        readWorkouts(tx, userId, first, 0, 20, { completedOnly: true, onDays: true }),
      ]),
    );
    expect(onThirtieth.workouts.map((w) => w.id)).toEqual([recorded]);
    expect(onFirst.workouts.map((w) => w.id)).toEqual([legacy]);
  });

  it("is the day History lists it under", async () => {
    const history = await read((tx) =>
      readHistoryWorkouts(tx, userId, dateWindow("2026-09-29", "2026-10-02", now)),
    );
    const days = Object.fromEntries(
      history.workouts.map((w) => [w.id, workoutItem(w, historyClock(now)).day]),
    );
    expect(days).toEqual({ [recorded]: "2026-09-30", [legacy]: "2026-10-01" });
    // And a range of the 30th alone holds it, not the session that is the 1st's.
    const alone = await read((tx) => readHistoryWorkouts(tx, userId, thirtieth));
    expect(alone.workouts.map((w) => w.id)).toEqual([recorded]);
  });

  it("is the day and the month the graphs draw it on", async () => {
    const both = dateWindow("2026-09-01", "2026-10-31", now);
    const [rows, sets, options, life] = await read((tx) =>
      Promise.all([
        readStrengthRows(tx, userId, now, both),
        readExerciseSetRows(tx, userId, now, both, `${exerciseId}:global:kg`),
        readExerciseSeriesOptions(tx, userId, thirtieth),
        readExerciseLife(tx, userId, exerciseId, now),
      ]),
    );
    const dated = (list: { sessionId: string; date: string }[]) =>
      Object.fromEntries(list.map((row) => [row.sessionId, row.date]));
    expect(dated(rows)).toEqual({ [recorded]: "2026-09-30", [legacy]: "2026-10-01" });
    expect(dated(sets)).toEqual({ [recorded]: "2026-09-30", [legacy]: "2026-10-01" });
    expect(options[0]).toMatchObject({ sessionsInRange: 1, sessions: 2 });
    expect(life.months.map((month) => month.month)).toEqual(["2026-09", "2026-10"]);
  });

  it("is the day its check-in and its working sets are counted on", async () => {
    const [recovery, muscles] = await read((tx) =>
      Promise.all([
        readRecoveryHistory(tx, userId, thirtieth, now),
        readMuscleVolume(tx, userId, thirtieth),
      ]),
    );
    expect(recovery.map((reading) => [reading.sessionId, reading.date])).toEqual([
      [recorded, "2026-09-30"],
    ]);
    expect(muscles.totalSets).toBe(1);
  });
});
