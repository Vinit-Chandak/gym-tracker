import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { exercises, gyms, setLogs, workoutExercises, workoutSessions } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { parseDateRange } from "@/server/validation/date-range";
import { readHistoryWorkouts } from "./history";
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
      for (const [index, startedAt] of [
        new Date("2026-08-31T18:30:00Z"), // first instant of September in this zone
        new Date("2026-09-01T18:30:00Z"),
        new Date("2026-09-02T18:30:00Z"), // exclusive end: must not appear
      ].entries()) {
        const [session] = await tx
          .insert(workoutSessions)
          .values({
            userId: user.id,
            gymId: gym!.id,
            startedAt,
            completedAt: new Date(startedAt.getTime() + 60_000),
            sleepHours: 7,
            backPainPre: index,
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
          backPainPre: w.backPainPre,
          shinLeftPre: w.shinLeftPre,
          shinRightPre: w.shinRightPre,
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
