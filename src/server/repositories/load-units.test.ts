import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

import { toSessionVM } from "@/app/(app)/workouts/[sessionId]/view-model";
import { exercises, profiles, workoutSessions } from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { convertLoad } from "@/lib/units";
import { listGyms } from "./gyms";
import {
  addExerciseToSession,
  deleteSet,
  finishSession,
  getSessionDetail,
  logSet,
  startAdHocSession,
  SetConflictError,
} from "./sessions";

let t: TestDatabase;
let user: { id: string; email: string };
let gymId: string;
let exerciseId: string;

beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
  user = await t.createAuthUser("units@example.com");
  await withUser(t.db, user.id, (tx) => seedTestUserData(tx, user));
  gymId = (await listGyms(t.db, user.id))[0]!.id;
  exerciseId = (await t.db.select().from(exercises).where(eq(exercises.slug, "hammer-curl")))[0]!
    .id;
});
afterAll(async () => t.close());

it("stores the entered unit, converts displayed copies, and normalizes progression history", async () => {
  await withUser(t.db, user.id, async (tx) => {
    await tx.update(profiles).set({ preferredUnit: "lb" }).where(eq(profiles.id, user.id));
    const first = await startAdHocSession(tx, user.id, { gymId });
    await tx
      .update(workoutSessions)
      .set({ startedAt: new Date(Date.now() - 60_000) })
      .where(eq(workoutSessions.id, first.sessionId));
    const slot = await addExerciseToSession(tx, user.id, first.sessionId, {
      exerciseId,
      equipmentInstanceId: null,
    });
    const input = {
      workoutExerciseId: slot.workoutExerciseId,
      setIndex: 1,
      setType: "working" as const,
      weight: 40,
      reps: 12,
      rir: 2,
      durationSeconds: null,
    };
    const logged = await logSet(tx, user.id, input);
    expect(logged).toMatchObject({ weight: 40, unit: "lb" });

    await tx.update(profiles).set({ preferredUnit: "kg" }).where(eq(profiles.id, user.id));
    const detail = (await getSessionDetail(tx, user.id, first.sessionId))!;
    const display = toSessionVM(detail, "UTC", "kg");
    expect(display.exercises[0]!.sets[0]).toMatchObject({ weight: 18.14, unit: "kg" });
    expect(detail.exercises[0]!.sets[0]).toMatchObject({ weight: 40, unit: "lb" });

    // A browser still displaying pounds must keep the unit of its submitted numbers.
    const second = await logSet(tx, user.id, { ...input, setIndex: 2, unit: "lb", weight: 45 });
    expect(second).toMatchObject({ weight: 45, unit: "lb" });
    await finishSession(tx, user.id, first.sessionId, { notes: null, bodyWeightKg: null });
    await tx
      .update(workoutSessions)
      .set({ completedAt: new Date(Date.now() - 10_000) })
      .where(eq(workoutSessions.id, first.sessionId));

    const next = await startAdHocSession(tx, user.id, { gymId });
    await addExerciseToSession(tx, user.id, next.sessionId, {
      exerciseId,
      equipmentInstanceId: null,
    });
    const nextDetail = (await getSessionDetail(tx, user.id, next.sessionId))!;
    expect(nextDetail.exercises[0]!.previous!.sets[0]).toMatchObject({ weight: 18.14, unit: "kg" });
    expect(nextDetail.exercises[0]!.suggestion!.sets[0]!.weight).toBeLessThan(25);
    await finishSession(tx, user.id, next.sessionId, { notes: null, bodyWeightKg: null });
  });
});

it("does not treat a retry in a different unit as the same saved set", async () => {
  await withUser(t.db, user.id, async (tx) => {
    const started = await startAdHocSession(tx, user.id, { gymId });
    const slot = await addExerciseToSession(tx, user.id, started.sessionId, {
      exerciseId,
      equipmentInstanceId: null,
    });
    const input = {
      workoutExerciseId: slot.workoutExerciseId,
      expectedCompletedAt: null,
      setIndex: 1,
      setType: "working" as const,
      weight: 40,
      reps: 10,
      rir: 2,
      durationSeconds: null,
    };
    await logSet(tx, user.id, { ...input, unit: "kg" });
    await expect(logSet(tx, user.id, { ...input, unit: "lb" })).rejects.toBeInstanceOf(
      SetConflictError,
    );
  });
});

it("never converts a stack number or plate count to kilograms", () => {
  expect(() => convertLoad(5, "stack_index", "kg")).toThrow();
});

it("a stale delete preserves another device's newer set, and a matching delete can be retried", async () => {
  await withUser(t.db, user.id, async (tx) => {
    const { sessionId } = await startAdHocSession(tx, user.id, { gymId });
    const { workoutExerciseId } = await addExerciseToSession(tx, user.id, sessionId, {
      exerciseId,
      equipmentInstanceId: null,
    });
    const input = {
      workoutExerciseId,
      setIndex: 1,
      setType: "working" as const,
      weight: 40,
      reps: 10,
      rir: 2,
      durationSeconds: null,
    };
    const first = await logSet(tx, user.id, input);
    // Two saves within one clock millisecond must still receive distinct versions.
    const clock = vi.spyOn(Date, "now").mockReturnValue(first.completedAt.getTime());
    const corrected = await logSet(tx, user.id, { ...input, reps: 12 }).finally(() =>
      clock.mockRestore(),
    );
    expect(corrected.completedAt.getTime()).toBeGreaterThan(first.completedAt.getTime());
    await expect(
      deleteSet(tx, user.id, workoutExerciseId, 1, first.completedAt.toISOString()),
    ).rejects.toBeInstanceOf(SetConflictError);
    const detail = await getSessionDetail(tx, user.id, sessionId);
    expect(detail?.exercises[0]?.sets[0]?.reps).toBe(12);
    await deleteSet(tx, user.id, workoutExerciseId, 1, corrected.completedAt.toISOString());
    await deleteSet(tx, user.id, workoutExerciseId, 1, corrected.completedAt.toISOString());
    const after = await getSessionDetail(tx, user.id, sessionId);
    expect(after?.exercises[0]?.sets).toEqual([]);
  });
});
