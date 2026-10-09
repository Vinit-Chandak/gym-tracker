import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  equipmentInstances,
  equipmentTypes,
  exercises,
  workoutExercises,
  workoutSubmissionReceipts,
} from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

/*
 * Adding several exercises in one submission (plan: "Add several exercises in one submission"),
 * through the real action and a real database: the order, the machines, the receipt that makes
 * a retry safe, and the checks that refuse a whole batch for one bad item.
 */

const state = vi.hoisted(() => ({
  db: null as unknown,
  user: { id: "", email: "batch@example.com" },
}));
vi.mock("@/db/client", () => ({ getDb: () => state.db }));
vi.mock("@/server/auth", () => ({ requireUser: async () => state.user }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

import { createEquipment } from "@/server/repositories/equipment";
import { createCustomExercise } from "@/server/repositories/manual-training";
import { finishSession, startAdHocSession } from "@/server/repositories/sessions";

import { addExercisesAction } from "./sessions";

let t: TestDatabase;
let gymId: string;
let otherGymId: string;
let sessionId: string;
const ids: Record<string, string> = {};
const machines: Record<string, string> = {};

const as = <T>(fn: (tx: Parameters<Parameters<typeof withUser>[2]>[0]) => Promise<T>) =>
  withUser(t.db, state.user.id, fn);

function form(key: string, items: [exercise: string, machine?: string][]): FormData {
  const data = new FormData();
  data.set("submissionKey", key);
  for (const [exercise, machine] of items) {
    data.append("exerciseId", exercise);
    data.append("equipmentInstanceId", machine ?? "");
  }
  return data;
}

async function slots() {
  return t.db
    .select({
      exerciseId: workoutExercises.exerciseId,
      equipmentInstanceId: workoutExercises.equipmentInstanceId,
      orderIndex: workoutExercises.orderIndex,
    })
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutSessionId, sessionId))
    .orderBy(asc(workoutExercises.orderIndex));
}

const add = (data: FormData) => addExercisesAction(sessionId, null, INITIAL_FORM_STATE, data);
const KEY = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

beforeAll(async () => {
  t = await createTestDatabase();
  state.db = t.db;
  await seedReferenceData(t.db);
  const created = await t.createAuthUser(state.user.email);
  state.user = { id: created.id, email: created.email };
  const fixture = await as((tx) => seedTestUserData(tx, state.user));
  gymId = fixture.gymIdBySlug.get("anytime-fitness")!;
  otherGymId = fixture.gymIdBySlug.get("samsung-gym")!;
  for (const slug of [
    "leg-press-45",
    "seated-leg-curl",
    "push-up",
    "hammer-curl",
    "lat-pulldown",
  ]) {
    const [row] = await t.db
      .select({ id: exercises.id })
      .from(exercises)
      .where(eq(exercises.slug, slug));
    ids[slug] = row!.id;
  }
  for (const name of ["45° leg press", "Seated leg curl"]) {
    const [row] = await t.db
      .select({ id: equipmentInstances.id })
      .from(equipmentInstances)
      .where(and(eq(equipmentInstances.gymId, gymId), eq(equipmentInstances.name, name)));
    machines[name] = row!.id;
  }
  sessionId = (await as((tx) => startAdHocSession(tx, state.user.id, { gymId }))).sessionId;
});

afterAll(async () => {
  await t.close();
});

describe("adding several exercises at once", () => {
  it("adds them after what is there, in the order chosen, each with its machine", async () => {
    await expect(add(form(KEY(1), [[ids["hammer-curl"]!]]))).rejects.toThrow(
      `redirect:/workouts/${sessionId}?added=1`,
    );
    await expect(
      add(
        form(KEY(2), [
          [ids["seated-leg-curl"]!, machines["Seated leg curl"]],
          [ids["leg-press-45"]!, machines["45° leg press"]],
          [ids["push-up"]!],
        ]),
      ),
    ).rejects.toThrow(`redirect:/workouts/${sessionId}?added=3`);
    expect(await slots()).toEqual([
      { exerciseId: ids["hammer-curl"], equipmentInstanceId: null, orderIndex: 1 },
      {
        exerciseId: ids["seated-leg-curl"],
        equipmentInstanceId: machines["Seated leg curl"],
        orderIndex: 2,
      },
      {
        exerciseId: ids["leg-press-45"],
        equipmentInstanceId: machines["45° leg press"],
        orderIndex: 3,
      },
      { exerciseId: ids["push-up"], equipmentInstanceId: null, orderIndex: 4 },
    ]);
  });

  it("adds nothing again when a lost reply is retried, and still lands on the workout", async () => {
    const before = await slots();
    await expect(
      add(
        form(KEY(2), [
          [ids["seated-leg-curl"]!, machines["Seated leg curl"]],
          [ids["leg-press-45"]!, machines["45° leg press"]],
          [ids["push-up"]!],
        ]),
      ),
    ).rejects.toThrow(`redirect:/workouts/${sessionId}?added=3`);
    expect(await slots()).toEqual(before);
  });

  it("refuses the same key sent with a different selection", async () => {
    const before = await slots();
    expect(await add(form(KEY(2), [[ids["push-up"]!]]))).toEqual({
      formError:
        "These were already added with a different selection. Open the workout to check it before adding more.",
    });
    expect(await slots()).toEqual(before);
  });

  it("still lets the same exercise be added again on purpose, with a new key", async () => {
    await expect(add(form(KEY(3), [[ids["push-up"]!]]))).rejects.toThrow("redirect:");
    const after = await slots();
    expect(after.filter((slot) => slot.exerciseId === ids["push-up"])).toHaveLength(2);
    expect(after.at(-1)?.orderIndex).toBe(5);
  });

  it("adds a machine exercise with no machine chosen as just that, for the workout to settle", async () => {
    await expect(add(form(KEY(4), [[ids["lat-pulldown"]!]]))).rejects.toThrow("redirect:");
    expect((await slots()).at(-1)).toEqual({
      exerciseId: ids["lat-pulldown"],
      equipmentInstanceId: null,
      orderIndex: 6,
    });
  });
});

describe("one bad item refuses the whole batch", () => {
  it("refuses a machine from another gym, writing nothing and keeping no receipt", async () => {
    const [legPress] = await t.db
      .select({ id: equipmentTypes.id })
      .from(equipmentTypes)
      .where(eq(equipmentTypes.slug, "leg_press_45"));
    const elsewhere = await as((tx) =>
      createEquipment(tx, state.user.id, otherGymId, {
        name: "Leg press over there",
        equipmentTypeId: legPress!.id,
        manufacturer: null,
        model: null,
        resistanceMode: "plate_loaded",
        unit: "kg",
        loadIncrement: null,
        availableLoads: [],
        loadConvention: "unknown",
        pulleyRatio: null,
        angleDegrees: null,
        notes: null,
      }),
    );
    const before = await slots();
    expect(
      await add(form(KEY(10), [[ids["push-up"]!], [ids["leg-press-45"]!, elsewhere.id]])),
    ).toEqual({ formError: "Choose an available machine for this exercise at this gym." });
    expect(await slots()).toEqual(before);
    const receipts = await t.db
      .select()
      .from(workoutSubmissionReceipts)
      .where(eq(workoutSubmissionReceipts.submissionKey, KEY(10)));
    expect(receipts).toEqual([]);
  });

  it("refuses another account's exercise", async () => {
    const other = await t.createAuthUser("someone-else@example.com");
    const theirs = await withUser(t.db, other.id, async (tx) => {
      await seedTestUserData(tx, other);
      return createCustomExercise(tx, other.id, {
        name: "Their own curl",
        category: "hypertrophy",
        modality: "dumbbell",
        measurement: "reps",
        primaryMuscles: ["biceps"],
        equipmentInstanceId: null,
      });
    });
    const before = await slots();
    expect(await add(form(KEY(11), [[ids["push-up"]!], [theirs.id]]))).toEqual({
      formError: "Choose an available exercise and try again.",
    });
    expect(await slots()).toEqual(before);
  });

  it("refuses the same exercise twice in one batch, and more than twenty", async () => {
    expect(await add(form(KEY(12), [[ids["push-up"]!], [ids["push-up"]!]]))).toEqual({
      formError: "Choose each exercise once.",
    });
    const many = Array.from({ length: 21 }, (_, n) => [KEY(100 + n)] as [string]);
    expect(await add(form(KEY(13), many))).toEqual({
      formError: "Add at most 20 exercises at a time.",
    });
    expect(await add(form(KEY(14), []))).toEqual({ formError: "Choose an exercise." });
  });

  it("keeps places unique and contiguous when two additions arrive together", async () => {
    const before = await slots();
    const results = await Promise.allSettled([
      add(form(KEY(20), [[ids["hammer-curl"]!], [ids["push-up"]!]])),
      add(form(KEY(21), [[ids["seated-leg-curl"]!], [ids["lat-pulldown"]!]])),
    ]);
    expect(
      results.every((r) => r.status === "rejected" && /redirect:/.test(String(r.reason))),
    ).toBe(true);
    const after = await slots();
    const places = after.map((slot) => slot.orderIndex);
    expect(places).toEqual(Array.from({ length: before.length + 4 }, (_, n) => n + 1));
  });

  it("lands a finished workout back in its edit, opened from where it was (ADR 0049)", async () => {
    const before = await slots();
    await as((tx) =>
      finishSession(tx, state.user.id, sessionId, { notes: null, bodyWeightKg: null }),
    );
    await expect(
      addExercisesAction(
        sessionId,
        "history",
        INITIAL_FORM_STATE,
        form(KEY(30), [[ids["push-up"]!]]),
      ),
    ).rejects.toThrow(`redirect:/workouts/${sessionId}?from=history&edit=1&added=1`);
    // An origin nobody listed is dropped rather than followed.
    await expect(
      addExercisesAction(
        sessionId,
        "elsewhere" as never,
        INITIAL_FORM_STATE,
        form(KEY(31), [[ids["hammer-curl"]!]]),
      ),
    ).rejects.toThrow(`redirect:/workouts/${sessionId}?edit=1&added=1`);
    expect(await slots()).toHaveLength(before.length + 2);
  });
});
