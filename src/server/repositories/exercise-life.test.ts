import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";

import { exercises } from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";

import { readExerciseLife } from "./exercise-life";
import { listGyms } from "./gyms";
import {
  addExerciseToSession,
  finishSession,
  logSet,
  skipExercise,
  startAdHocSession,
} from "./sessions";

/*
 * The exercise page's "Sessions" counts the finished workouts the exercise was done in: a
 * workout it was skipped in, or only planned in and never logged, is not one of them, which is
 * what its Latest list and its chart already say.
 */

let t: TestDatabase;
let user: { id: string; email: string };
let gymId = "";
let squat = "";

const as = <T>(fn: (tx: Parameters<Parameters<typeof withUser>[2]>[0]) => Promise<T>) =>
  withUser(t.db, user.id, fn);

/** One finished workout with the squat in it, done as `done` says. */
async function workout(done: "logged" | "warm-up only" | "skipped" | "untouched") {
  await as(async (tx) => {
    const { sessionId } = await startAdHocSession(tx, user.id, { gymId });
    const { workoutExerciseId } = await addExerciseToSession(tx, user.id, sessionId, {
      exerciseId: squat,
      equipmentInstanceId: null,
    });
    if (done === "logged" || done === "warm-up only")
      await logSet(tx, user.id, {
        workoutExerciseId,
        setIndex: 1,
        setType: done === "logged" ? "working" : "warmup",
        weight: 100,
        reps: 5,
        rir: 2,
        durationSeconds: null,
      });
    if (done === "skipped") await skipExercise(tx, user.id, workoutExerciseId, "Rack taken.");
    await finishSession(tx, user.id, sessionId, { notes: null, bodyWeightKg: null });
  });
}

beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
  user = await t.createAuthUser("exercise-life@example.com");
  await as((tx) => seedTestUserData(tx, user));
  gymId = (await as((tx) => listGyms(tx, user.id))).find((g) => g.slug === "anytime-fitness")!.id;
  const [row] = await t.db
    .select({ id: exercises.id })
    .from(exercises)
    .where(eq(exercises.slug, "high-bar-squat"));
  squat = row!.id;
});

afterAll(async () => {
  await t.close();
});

it("counts only the finished workouts the exercise was done in", async () => {
  const sessions = async () =>
    (await as((tx) => readExerciseLife(tx, user.id, squat, "Asia/Kolkata"))).sessions;
  const before = await sessions();
  await workout("skipped");
  await workout("untouched");
  await workout("warm-up only");
  expect(await sessions()).toBe(before);
  await workout("logged");
  expect(await sessions()).toBe(before + 1);
});
