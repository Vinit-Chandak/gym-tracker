import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";

import {
  equipmentTypes,
  exercises,
  profiles,
  programDays,
  programExercises,
  programs,
} from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { resetReferenceCache } from "@/server/queries/reference";

import { markEquipmentAbsent, unmarkEquipmentAbsent } from "./absent-equipment";
import { storePlan } from "./coach-plans";
import { addGymFallback } from "./fallbacks";
import { listGyms } from "./gyms";
import {
  discardSession,
  getSessionDetail,
  startPlannedSession,
  substituteExercise,
} from "./sessions";

/*
 * A fallback remembered at a gym (Substitute ticked "Remember" by default before this plan) is
 * for when the planned exercise cannot be done there: it never replaces a lift that can be, and a
 * basic is here until someone says it is not. A row already doing its slot's fallback is that
 * exercise, so a machine question about it can still be answered; and the coach's targets stay
 * with the exercise they were written for.
 */

let t: TestDatabase;
let user: { id: string; email: string };
let samsung = "";
const ex: Record<string, string> = {};

const as = <T>(fn: (tx: Parameters<Parameters<typeof withUser>[2]>[0]) => Promise<T>) =>
  withUser(t.db, user.id, fn);

/** The active programme's slot for an exercise, with its day. */
async function slotOf(slug: string) {
  const [slot] = await t.db
    .select({ id: programExercises.id, dayId: programDays.id, dayIndex: programDays.dayIndex })
    .from(programExercises)
    .innerJoin(programDays, eq(programDays.id, programExercises.programDayId))
    .innerJoin(programs, eq(programs.id, programDays.programId))
    .where(
      and(
        eq(programs.userId, user.id),
        eq(programs.status, "active"),
        eq(programExercises.exerciseId, ex[slug]!),
      ),
    )
    .limit(1);
  return slot!;
}

async function start(slug: string) {
  const slot = await slotOf(slug);
  const { sessionId } = await as((tx) =>
    startPlannedSession(tx, user.id, { gymId: samsung, programDayId: slot.dayId, cycleIndex: 1 }),
  );
  const detail = async () => {
    const found = await as((tx) => getSessionDetail(tx, user.id, sessionId));
    return found!.exercises.find((e) => e.planned?.programExerciseId === slot.id)!;
  };
  return { sessionId, slot, row: await detail(), detail };
}

beforeAll(async () => {
  t = await createTestDatabase();
  resetReferenceCache();
  await seedReferenceData(t.db);
  resetReferenceCache();
  user = await t.createAuthUser("fallbacks@example.com");
  await as((tx) => seedTestUserData(tx, user));
  await t.db
    .update(profiles)
    .set({ aiCoachEnabled: true, timeZone: "Asia/Kolkata" })
    .where(eq(profiles.id, user.id));
  // Samsung Gym has nothing registered: its basics are assumed, anything else is unknown.
  samsung = (await as((tx) => listGyms(tx, user.id))).find((g) => g.slug === "samsung-gym")!.id;
  for (const row of await t.db.select({ id: exercises.id, slug: exercises.slug }).from(exercises))
    ex[row.slug] = row.id;
  // One swap each, remembered at this gym.
  for (const [exerciseId, fallbackExerciseId] of [
    ["barbell-bench-press", "flat-db-press"],
    ["leg-press-horizontal", "leg-press-45"],
  ] as const)
    await as((tx) =>
      addGymFallback(tx, user.id, {
        gymId: samsung,
        exerciseId: ex[exerciseId]!,
        fallbackExerciseId: ex[fallbackExerciseId]!,
        fallbackEquipmentInstanceId: null,
      }),
    );
});

afterAll(async () => {
  await t.close();
});

it("keeps a barbell lift with a remembered swap, with nothing to settle", async () => {
  const { sessionId, row } = await start("barbell-bench-press");
  expect(row.exercise.slug).toBe("barbell-bench-press");
  expect(row.substitutionReason).toBeNull();
  expect(row.decision).toBeNull();
  await as((tx) => discardSession(tx, user.id, sessionId));
});

it("takes the remembered swap once the lift is marked not here, and the swap is not asked about", async () => {
  const [barbell] = await t.db
    .select({ id: equipmentTypes.id })
    .from(equipmentTypes)
    .where(eq(equipmentTypes.slug, "barbell"));
  await as((tx) => markEquipmentAbsent(tx, user.id, samsung, barbell!.id));
  const { sessionId, row } = await start("barbell-bench-press");
  expect(row.exercise.slug).toBe("flat-db-press");
  expect(row.substitutionReason).toBe(
    "Fallback at Samsung Gym: Barbell bench press → Flat dumbbell press",
  );
  // The row does its slot's fallback: it is not a fallback to itself, so nothing is left open.
  expect(row.decision).toBeNull();
  await as((tx) => discardSession(tx, user.id, sessionId));
  await as((tx) => unmarkEquipmentAbsent(tx, user.id, samsung, barbell!.id));
});

it("asks the one-tap question about a basic machine a remembered swap leads to", async () => {
  // Nobody has answered for the horizontal leg press here, so the athlete's own answer is used.
  const { sessionId, row } = await start("leg-press-horizontal");
  expect(row.exercise.slug).toBe("leg-press-45");
  expect(row.decision?.ask?.kind).toBe("confirm_basic");
  await as((tx) => discardSession(tx, user.id, sessionId));
});

it("keeps the exercise the coach wrote targets for, and the targets stay with it", async () => {
  const slot = await slotOf("leg-press-horizontal");
  await as((tx) =>
    storePlan(tx, user.id, {
      slot: { cycleIndex: 1, dayIndex: slot.dayIndex },
      gymId: samsung,
      trigger: "nightly",
      plan: {
        summary: "Leg day.",
        exercises: [
          {
            slotId: slot.id,
            action: "keep",
            exerciseSlug: "leg-press-horizontal",
            sets: [
              { reps: 10, weight: 100, rir: 2 },
              { reps: 10, weight: 100, rir: 2 },
            ],
          },
        ],
      },
    }),
  );
  const { sessionId, row, detail } = await start("leg-press-horizontal");
  expect(row.exercise.slug).toBe("leg-press-horizontal");
  expect(row.substitutionReason).toBeNull();
  expect(row.suggestion?.kind).toBe("coach");
  expect(row.suggestion?.sets.map((s) => [s.weight, s.reps])).toEqual([
    [100, 10],
    [100, 10],
  ]);
  // The workout still offers the athlete's swap for the machine nobody has answered for.
  expect(row.decision?.resolution.status).toBe("fallback");
  expect(row.decision?.fallbackOptions.map((o) => o.exerciseName)).toContain("45° leg press");
  // Taken, the new exercise gets its own numbers, not the coach's for the other machine.
  await as((tx) =>
    substituteExercise(tx, user.id, {
      workoutExerciseId: row.id,
      exerciseId: ex["leg-press-45"]!,
      equipmentInstanceId: null,
      reason: "45° leg press",
    }),
  );
  const swapped = await detail();
  expect(swapped.exercise.slug).toBe("leg-press-45");
  expect(swapped.suggestion?.kind).not.toBe("coach");
  expect(swapped.decision?.ask?.kind).toBe("confirm_basic");
  await as((tx) => discardSession(tx, user.id, sessionId));
});
