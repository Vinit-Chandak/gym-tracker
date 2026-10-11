import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

import { exercises, setLogs, workoutSessions } from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

/*
 * Finishing and discarding through the real actions and a real database: a press repeated after
 * its first reply was lost lands where the first one would have, and a workout left open
 * finishes as of its last set.
 */

const state = vi.hoisted(() => ({
  db: null as unknown,
  user: { id: "", email: "finish@example.com" },
}));
vi.mock("@/db/client", () => ({ getDb: () => state.db }));
vi.mock("@/server/auth", () => ({ requireUser: async () => state.user }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

import { addExerciseToSession, logSet, startAdHocSession } from "@/server/repositories/sessions";

import { discardSessionAction, finishLeftOpenAction, finishSessionAction } from "./sessions";

let t: TestDatabase;
let gymId: string;
let curlId: string;

const as = <T>(fn: (tx: Parameters<Parameters<typeof withUser>[2]>[0]) => Promise<T>) =>
  withUser(t.db, state.user.id, fn);

/** An open workout with one set in it, saved at `setAt`. */
async function workout(setAt?: Date): Promise<string> {
  const { sessionId } = await as((tx) => startAdHocSession(tx, state.user.id, { gymId }));
  const { workoutExerciseId } = await as((tx) =>
    addExerciseToSession(tx, state.user.id, sessionId, {
      exerciseId: curlId,
      equipmentInstanceId: null,
    }),
  );
  await as((tx) =>
    logSet(tx, state.user.id, {
      workoutExerciseId,
      setIndex: 1,
      setType: "working",
      weight: 15,
      reps: 12,
      rir: 2,
      durationSeconds: null,
    }),
  );
  if (setAt) {
    await t.db
      .update(workoutSessions)
      .set({ startedAt: new Date(setAt.getTime() - 3_600_000) })
      .where(eq(workoutSessions.id, sessionId));
    await t.db
      .update(setLogs)
      .set({ completedAt: setAt })
      .where(eq(setLogs.workoutExerciseId, workoutExerciseId));
  }
  return sessionId;
}

const completedAt = async (sessionId: string) =>
  (
    await t.db
      .select({ at: workoutSessions.completedAt })
      .from(workoutSessions)
      .where(eq(workoutSessions.id, sessionId))
  )[0]?.at ?? null;

beforeAll(async () => {
  t = await createTestDatabase();
  state.db = t.db;
  await seedReferenceData(t.db);
  const created = await t.createAuthUser(state.user.email);
  state.user = { id: created.id, email: created.email };
  const fixture = await as((tx) => seedTestUserData(tx, state.user));
  gymId = fixture.gymIdBySlug.get("anytime-fitness")!;
  const [curl] = await t.db
    .select({ id: exercises.id })
    .from(exercises)
    .where(eq(exercises.slug, "hammer-curl"));
  curlId = curl!.id;
});

afterAll(async () => {
  await t.close();
});

it("takes Finish pressed again after a lost reply to the summary, not to a refusal", async () => {
  const sessionId = await workout();
  const finish = () => finishSessionAction(sessionId, INITIAL_FORM_STATE, new FormData());
  await expect(finish()).rejects.toThrow(`redirect:/workouts/${sessionId}?finished=1`);
  await expect(finish()).rejects.toThrow(`redirect:/workouts/${sessionId}?finished=1`);
});

it("finishes a workout left open as of its last set, from the Finish page or with one tap", async () => {
  const lastSet = new Date(Date.now() - 13 * 3_600_000);
  const fromPage = await workout(lastSet);
  const data = new FormData();
  data.set("asOf", "last-set");
  await expect(finishSessionAction(fromPage, INITIAL_FORM_STATE, data)).rejects.toThrow(
    "redirect:",
  );
  expect((await completedAt(fromPage))?.toISOString()).toBe(lastSet.toISOString());

  const fromToday = await workout(lastSet);
  await expect(finishLeftOpenAction(fromToday)).rejects.toThrow(
    `redirect:/workouts/${fromToday}?finished=1`,
  );
  expect((await completedAt(fromToday))?.toISOString()).toBe(lastSet.toISOString());
  // Pressed again after a lost reply, it was done the first time.
  await expect(finishLeftOpenAction(fromToday)).rejects.toThrow(
    `redirect:/workouts/${fromToday}?finished=1`,
  );
});

it("takes Discard pressed again after a lost reply to Today, the session gone", async () => {
  const { sessionId } = await as((tx) => startAdHocSession(tx, state.user.id, { gymId }));
  await expect(discardSessionAction(sessionId)).rejects.toThrow("redirect:/today?discarded=1");
  await expect(discardSessionAction(sessionId)).rejects.toThrow("redirect:/today?discarded=1");
});
