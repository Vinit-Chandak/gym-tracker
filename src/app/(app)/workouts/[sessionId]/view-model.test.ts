import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";

import { equipmentInstances, equipmentTypes, exercises, gyms, profiles } from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import type { Tx } from "@/db/types";
import { withUser } from "@/db/with-user";
import type { SetChange } from "@/lib/set-changes";
import { ensureProfile } from "@/server/queries/profile";
import {
  addExerciseToSession,
  deleteSet,
  getSessionDetail,
  logSet,
  startAdHocSession,
  type LogSetInput,
} from "@/server/repositories/sessions";

import { toSessionVM, withSetChanges, type SessionVM } from "./view-model";

/**
 * A set is saved without the workout being rendered again (ADR 0030); the browser lays the sets
 * it saved over the render it holds. These check that overlay against what the server itself
 * would render at every step, on a real schema.
 */

let t: TestDatabase;
let userId: string;
let sessionId: string;
/** Two exercises on one cable stack, and a dumbbell exercise counted in the account's pounds. */
let slot: { curl: string; hammer: string; dumbbell: string };
const changes: SetChange[] = [];

const as = <T>(fn: (tx: Tx) => Promise<T>) => withUser(t.db, userId, fn);

async function exerciseId(tx: Tx, slug: string): Promise<string> {
  const [row] = await tx
    .select({ id: exercises.id })
    .from(exercises)
    .where(eq(exercises.slug, slug));
  return row!.id;
}

beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
  const user = await t.createAuthUser("overlay@example.com");
  userId = user.id;
  await as(async (tx) => {
    await ensureProfile(tx, { id: user.id, email: user.email });
    await tx.update(profiles).set({ preferredUnit: "lb" }).where(eq(profiles.id, userId));
    const [gym] = await tx
      .insert(gyms)
      .values({ userId, slug: "gym", name: "Gym", kind: "gym", isDefault: true })
      .returning();
    const [cable] = await tx
      .select()
      .from(equipmentTypes)
      .where(eq(equipmentTypes.slug, "cable_station"));
    const [stack] = await tx
      .insert(equipmentInstances)
      .values({
        userId,
        gymId: gym!.id,
        equipmentTypeId: cable!.id,
        name: "Cable stack",
        resistanceMode: "selectorized",
        unit: "kg",
        loadIncrement: 2.5,
      })
      .returning();
    ({ sessionId } = await startAdHocSession(tx, userId, { gymId: gym!.id }));
    const add = async (slug: string, machine: string | null) =>
      (
        await addExerciseToSession(tx, userId, sessionId, {
          exerciseId: await exerciseId(tx, slug),
          equipmentInstanceId: machine,
        })
      ).workoutExerciseId;
    slot = {
      curl: await add("cable-curl", stack!.id),
      hammer: await add("cable-hammer-curl", stack!.id),
      dumbbell: await add("hammer-curl", null),
    };
  });
});
afterAll(async () => t.close());

/** The workout exactly as its page renders it now. */
async function rendered(): Promise<SessionVM> {
  const detail = await as((tx) =>
    getSessionDetail(tx, userId, sessionId, {
      restTimerEnabled: false,
      preferredUnit: "lb",
      timeZone: "UTC",
    }),
  );
  return toSessionVM(detail!, "UTC", "lb");
}

/** Saves a set as the logger does, and keeps the change as the browser would. */
async function save(workoutExerciseId: string, setIndex: number, values: Partial<LogSetInput>) {
  const set = await as((tx) =>
    logSet(tx, userId, {
      workoutExerciseId,
      setIndex,
      setType: "working",
      weight: 50,
      reps: 10,
      rir: 2,
      durationSeconds: null,
      ...values,
    }),
  );
  changes.push({
    stamp: changes.length + 1,
    sessionId,
    workoutExerciseId,
    setIndex,
    set: { ...set, completedAt: set.completedAt.toISOString() },
  });
}

async function remove(workoutExerciseId: string, setIndex: number) {
  await as((tx) => deleteSet(tx, userId, workoutExerciseId, setIndex));
  changes.push({ stamp: changes.length + 1, sessionId, workoutExerciseId, setIndex, set: null });
}

it("shows after every save and delete exactly what a new render would", async () => {
  const first = await rendered();
  const steps = [
    () => save(slot.curl, 1, { weight: 50 }),
    () => save(slot.curl, 2, { weight: 55 }),
    // Entered in kilograms, shown in the account's pounds, as the server converts it.
    () => save(slot.dumbbell, 1, { weight: 20, unit: "kg" }),
    // Another exercise on the same stack: both exercises' ladders learn the load.
    () => save(slot.hammer, 1, { weight: 60 }),
    // Saved and then deleted here: gone from the sets and from the ladder.
    () => remove(slot.curl, 1),
    // Saved again with new numbers: the old load is no longer on the ladder either.
    () => save(slot.curl, 2, { weight: 57.5, reps: 8 }),
    () => save(slot.curl, 1, { weight: 52.5 }),
  ];
  for (const step of steps) {
    await step();
    expect(withSetChanges(first, changes, 0)).toStrictEqual(await rendered());
  }
  const curl = (await rendered()).exercises.find((exercise) => exercise.id === slot.curl)!;
  expect(curl.equipment!.ladder!.known).toEqual([52.5, 57.5, 60]);
});

it("adds only what a render did not hold, and nothing from another workout", async () => {
  const held = await rendered();
  const seen = changes.length;
  await save(slot.dumbbell, 2, { weight: 22.5, unit: "kg" });
  const elsewhere: SetChange = {
    stamp: changes.length + 1,
    sessionId: crypto.randomUUID(),
    workoutExerciseId: slot.dumbbell,
    setIndex: 1,
    set: null,
  };
  const now = await rendered();
  const merged = withSetChanges(held, [...changes, elsewhere], seen);
  expect(merged).toStrictEqual(now);
  // Exercises the changes did not touch are the render's own objects.
  expect(merged.exercises.find((exercise) => exercise.id === slot.hammer)).toBe(
    held.exercises.find((exercise) => exercise.id === slot.hammer),
  );
  // A render made after every change is returned as it is.
  expect(withSetChanges(now, changes, changes.length)).toBe(now);
});

it("is still right for a render that raced a save and already holds it", async () => {
  await save(slot.hammer, 2, { weight: 62.5 });
  await remove(slot.dumbbell, 1);
  const now = await rendered();
  // Rendered after both writes, yet told it had seen neither of them.
  expect(withSetChanges(now, changes, changes.length - 2)).toStrictEqual(now);
});
