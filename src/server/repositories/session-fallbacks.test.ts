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
import { createEquipment, setEquipmentActive } from "./equipment";
import { addGymFallback } from "./fallbacks";
import { listGyms } from "./gyms";
import { defaultMachineInput } from "./starter-equipment";
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
            note: "Feet high on the platform.",
            restSeconds: 240,
            perSide: true,
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
  expect(row).toMatchObject({
    coachNote: "Feet high on the platform.",
    coachRestSeconds: 240,
    coachPerSide: true,
  });
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
  // Nor its rest, its note or its per-side: they were the other machine's.
  expect(swapped).toMatchObject({ coachNote: null, coachRestSeconds: null, coachPerSide: null });
  expect(swapped.decision?.ask?.kind).toBe("confirm_basic");
  await as((tx) => discardSession(tx, user.id, sessionId));
});

/** The coach keeping a slot as it stands, with targets or without. */
async function keep(slug: string, sets: { reps: number; weight: number; rir: number }[] = []) {
  const slot = await slotOf(slug);
  return as((tx) =>
    storePlan(tx, user.id, {
      slot: { cycleIndex: 1, dayIndex: slot.dayIndex },
      gymId: samsung,
      trigger: "nightly",
      plan: {
        summary: "As planned.",
        exercises: [{ slotId: slot.id, action: "keep", exerciseSlug: slug, sets }],
      },
    }),
  );
}

/** The template backs hip abduction up with a cable; says there is no cable station here. */
async function withoutCables(fn: () => Promise<void>) {
  const [cable] = await t.db
    .select({ id: equipmentTypes.id })
    .from(equipmentTypes)
    .where(eq(equipmentTypes.slug, "cable_station"));
  await as((tx) => markEquipmentAbsent(tx, user.id, samsung, cable!.id));
  try {
    await fn();
  } finally {
    await as((tx) => unmarkEquipmentAbsent(tx, user.id, samsung, cable!.id));
  }
}

it("holds a kept slot to the backup rule: an unconfirmed machine needs a backup available now", async () => {
  // Nobody has confirmed a hip abduction machine at Samsung Gym. Its backup, cable hip abduction,
  // needs a cable machine: the gym's cable station is a basic, so it is available now.
  await expect(keep("hip-abduction", [{ reps: 12, weight: 40, rir: 2 }])).resolves.toBeTruthy();
  // Once the athlete has said there is no cable station, nothing backs the machine up.
  await withoutCables(async () => {
    await expect(keep("hip-abduction", [{ reps: 12, weight: 40, rir: 2 }])).rejects.toThrow(
      /nobody has confirmed/,
    );
    await expect(keep("hip-abduction")).rejects.toThrow(/nobody has confirmed/);
  });
});

it("counts a backup only as the workout would use it, on the machine it names", async () => {
  const [type] = await t.db
    .select()
    .from(equipmentTypes)
    .where(eq(equipmentTypes.slug, "leg_press_horizontal"));
  // Two horizontal leg presses: the one the fallback names has gone; the other is still here.
  const [gone, other] = await as((tx) =>
    Promise.all([
      createEquipment(
        tx,
        user.id,
        samsung,
        defaultMachineInput(type!, "kg", "Old horizontal press"),
      ),
      createEquipment(
        tx,
        user.id,
        samsung,
        defaultMachineInput(type!, "kg", "New horizontal press"),
      ),
    ]),
  );
  await as((tx) =>
    addGymFallback(tx, user.id, {
      gymId: samsung,
      exerciseId: ex["hip-abduction"]!,
      fallbackExerciseId: ex["leg-press-horizontal"]!,
      fallbackEquipmentInstanceId: gone!.id,
    }),
  );
  // With no cable station, the fallback naming a machine is the only backup left.
  await withoutCables(async () => {
    // While the named machine is here, it is the backup.
    await expect(keep("hip-abduction")).resolves.toBeTruthy();
    await as((tx) => setEquipmentActive(tx, user.id, gone!.id, false));
    await expect(keep("hip-abduction")).rejects.toThrow(/nobody has confirmed/);
  });
  expect(other).toBeTruthy();
});
