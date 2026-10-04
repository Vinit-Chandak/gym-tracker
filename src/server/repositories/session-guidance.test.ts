import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { exerciseGuides, exerciseMedia, exercises, gyms } from "@/db/schema";
import { GUIDES, MEDIA } from "@/db/seed/data/guides";
import { seedReferenceData } from "@/db/seed/reference";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { ensureProfile } from "@/server/queries/profile";
import { resetReferenceCache } from "@/server/queries/reference";

import { createCustomExercise } from "./manual-training";
import { addExerciseToSession, getSessionDetail, startAdHocSession } from "./sessions";

/*
 * The workout carries every exercise's guide with the page (plan: the guide data path), so
 * Technique reads mid-session without a connection: a shared exercise's guide as drafts allow,
 * how to log it, what it said before it had a guide, and a custom exercise's own notes.
 */

let t: TestDatabase;
let user: { id: string; email: string };
let sessionId: string;
const slot: Record<string, string> = {};
const exercise: Record<string, string> = {};

const as = <T>(fn: (tx: Parameters<Parameters<typeof withUser>[2]>[0]) => Promise<T>) =>
  withUser(t.db, user.id, fn);

async function guidanceOf(key: string, includeGuidance = true) {
  const detail = await as((tx) => getSessionDetail(tx, user.id, sessionId, { includeGuidance }));
  return detail!.exercises.find((e) => e.id === slot[key])!.guidance;
}

beforeAll(async () => {
  t = await createTestDatabase();
  resetReferenceCache();
  await seedReferenceData(t.db);
  resetReferenceCache();
  user = await t.createAuthUser("guidance@example.com");
  await as((tx) => ensureProfile(tx, user));
  for (const row of await t.db.select({ id: exercises.id, slug: exercises.slug }).from(exercises))
    exercise[row.slug] = row.id;
  await as(async (tx) => {
    const [gym] = await tx
      .insert(gyms)
      .values({ userId: user.id, name: "Garage", slug: "garage", kind: "home" })
      .returning({ id: gyms.id });
    ({ sessionId } = await startAdHocSession(tx, user.id, { gymId: gym!.id }));
    const custom = await createCustomExercise(tx, user.id, {
      name: "My cable-free fly",
      category: "hypertrophy",
      modality: "dumbbell",
      measurement: "reps",
      primaryMuscles: ["chest"],
      equipmentInstanceId: null,
      notes: "Elbows soft, stop at chest height.",
    });
    for (const [key, exerciseId] of [
      ["incline", exercise["incline-db-press"]!],
      ["goblet", exercise["goblet-squat"]!],
      ["fly", exercise["db-fly"]!],
      ["custom", custom.id],
    ] as const) {
      const { workoutExerciseId } = await addExerciseToSession(tx, user.id, sessionId, {
        exerciseId,
        equipmentInstanceId: null,
      });
      slot[key] = workoutExerciseId;
    }
  });
});

afterEach(() => {
  delete process.env.OVERLOAD_SHOW_DRAFTS;
  resetReferenceCache();
});

afterAll(async () => {
  await t.close();
});

describe("a workout's guidance", () => {
  it("keeps drafts out where drafts are not shown, and what the exercise said before", async () => {
    // Every guide is a draft awaiting the owner; tests run where drafts are hidden.
    expect(GUIDES.find((g) => g.exercise === "incline-db-press")?.status).toBe("draft");
    expect(await guidanceOf("incline")).toEqual({
      guide: null,
      logNote: "Load is per dumbbell.",
      notes: "Set the bench to 15–30°.",
      ownNotes: false,
      formUrl: null,
      demonstrations: [],
    });
  });

  it("shows a published guide and only its approved demonstrations", async () => {
    const id = exercise["incline-db-press"]!;
    await t.db
      .update(exerciseGuides)
      .set({ status: "published", reviewer: "Owner", reviewedOn: "2026-10-04" })
      .where(eq(exerciseGuides.exerciseId, id));
    const [first] = await t.db
      .select({ id: exerciseMedia.id })
      .from(exerciseMedia)
      .where(eq(exerciseMedia.exerciseId, id));
    await t.db
      .update(exerciseMedia)
      .set({ status: "approved" })
      .where(and(eq(exerciseMedia.id, first!.id)));
    resetReferenceCache();
    const seeded = GUIDES.find((g) => g.exercise === "incline-db-press")!;
    const guidance = await guidanceOf("incline");
    expect(guidance?.guide).toEqual({
      status: "published",
      setup: seeded.setup,
      steps: seeded.steps,
      cues: seeded.cues,
      mistakes: seeded.mistakes,
    });
    // The guide replaces the old note; how to log stays apart from the movement.
    expect(guidance?.notes).toBe("Set the bench to 15–30°.");
    expect(guidance?.logNote).toBe("Load is per dumbbell.");
    expect(guidance?.demonstrations).toHaveLength(1);
    expect(guidance?.demonstrations[0]).toMatchObject({ status: "approved" });
  });

  it("shows drafts and candidate videos where drafts are switched on", async () => {
    process.env.OVERLOAD_SHOW_DRAFTS = "1";
    const guidance = await guidanceOf("goblet");
    expect(guidance?.guide?.status).toBe("draft");
    expect(guidance?.demonstrations.length).toBe(
      MEDIA.filter((m) => m.exercise === "goblet-squat").length,
    );
    expect(guidance?.demonstrations.every((d) => d.status === "candidate")).toBe(true);
  });

  it("is honest about an exercise with no guide, keeping how to log it and its note", async () => {
    process.env.OVERLOAD_SHOW_DRAFTS = "1";
    expect(GUIDES.some((g) => g.exercise === "db-fly")).toBe(false);
    expect(await guidanceOf("fly")).toMatchObject({
      guide: null,
      logNote: "Load is per dumbbell.",
      notes: "Soft elbows, stop at chest level.",
      demonstrations: [],
    });
  });

  it("keeps a custom exercise's own notes as its guidance", async () => {
    expect(await guidanceOf("custom")).toEqual({
      guide: null,
      logNote: null,
      notes: "Elbows soft, stop at chest height.",
      ownNotes: true,
      formUrl: null,
      demonstrations: [],
    });
  });

  it("reads nothing when the page asks for the session without guidance", async () => {
    expect(await guidanceOf("incline", false)).toBeNull();
  });
});
