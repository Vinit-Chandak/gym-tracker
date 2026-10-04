import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  equipmentInstances,
  equipmentTypes,
  exercises,
  gymAbsentEquipmentTypes,
  gyms,
  workoutExercises,
} from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { ensureProfile } from "@/server/queries/profile";
import { resetReferenceCache } from "@/server/queries/reference";

import { createEquipment } from "./equipment";
import {
  addExerciseToSession,
  finishSession,
  getSessionDetail,
  SessionFinishedError,
  startAdHocSession,
} from "./sessions";
import {
  archiveWorkoutMachine,
  chooseEquipmentVariant,
  confirmEquipmentHere,
  markEquipmentNotHere,
} from "./workout-confirmation";

/*
 * Settling machines in the workout (plan: gradual confirmation during workouts), end to end:
 * what the decision asks, and what each answer does to the gym's record and to the exercise.
 */

let t: TestDatabase;
let user: { id: string; email: string };
const type: Record<string, string> = {};
const exercise: Record<string, string> = {};

const as = <T>(fn: (tx: Parameters<Parameters<typeof withUser>[2]>[0]) => Promise<T>) =>
  withUser(t.db, user.id, fn);

/** A fresh gym, an ad hoc session there, and the exercise added without a machine. */
async function slotAt(kind: "gym" | "home", exerciseSlug: string) {
  return as(async (tx) => {
    const [gym] = await tx
      .insert(gyms)
      .values({
        userId: user.id,
        name: `Gym ${crypto.randomUUID().slice(0, 6)}`,
        slug: `gym-${crypto.randomUUID().slice(0, 8)}`,
        kind,
      })
      .returning({ id: gyms.id });
    const { sessionId } = await startAdHocSession(tx, user.id, { gymId: gym!.id });
    const { workoutExerciseId } = await addExerciseToSession(tx, user.id, sessionId, {
      exerciseId: exercise[exerciseSlug]!,
      equipmentInstanceId: null,
    });
    return { gymId: gym!.id, sessionId, workoutExerciseId };
  });
}

async function decisionOf(sessionId: string, workoutExerciseId: string) {
  const detail = await as((tx) => getSessionDetail(tx, user.id, sessionId));
  return detail!.exercises.find((e) => e.id === workoutExerciseId)!;
}

beforeAll(async () => {
  t = await createTestDatabase();
  resetReferenceCache();
  await seedReferenceData(t.db);
  resetReferenceCache();
  user = await t.createAuthUser("confirm@example.com");
  await as((tx) => ensureProfile(tx, user));
  for (const row of await t.db.select().from(equipmentTypes)) type[row.slug] = row.id;
  for (const row of await t.db.select({ id: exercises.id, slug: exercises.slug }).from(exercises))
    exercise[row.slug] = row.id;
});

afterAll(async () => {
  await t.close();
});

describe("a gym basic nobody has confirmed", () => {
  it("asks with one tap, offering the family's other variants", async () => {
    const { sessionId, workoutExerciseId } = await slotAt("gym", "leg-press-45");
    const slot = await decisionOf(sessionId, workoutExerciseId);
    expect(slot.decision?.ask).toMatchObject({
      kind: "confirm_basic",
      typeId: type.leg_press_45,
      name: "45° leg press",
      family: {
        name: "Leg press",
        variants: [
          expect.objectContaining({ slug: "leg_press_horizontal" }),
          expect.objectContaining({ slug: "leg_press_vertical" }),
        ],
      },
    });
  });

  it("registers it on Yes, it's here, and puts it on the exercise before the first set", async () => {
    const { gymId, sessionId, workoutExerciseId } = await slotAt("gym", "leg-press-45");
    const outcome = await as((tx) =>
      confirmEquipmentHere(tx, user.id, workoutExerciseId, type.leg_press_45!, "kg"),
    );
    expect(outcome.attached).toBe(true);
    const [machine] = await t.db
      .select()
      .from(equipmentInstances)
      .where(eq(equipmentInstances.gymId, gymId));
    expect(machine).toMatchObject({ name: "45° leg press", equipmentTypeId: type.leg_press_45 });
    const slot = await decisionOf(sessionId, workoutExerciseId);
    expect(slot.equipment?.id).toBe(machine!.id);
    expect(slot.decision).toBeNull();
  });

  it("records it as not here on Not here, and the question goes", async () => {
    const { gymId, sessionId, workoutExerciseId } = await slotAt("gym", "leg-press-45");
    expect(
      await as((tx) => markEquipmentNotHere(tx, user.id, workoutExerciseId, type.leg_press_45!)),
    ).toEqual({ recorded: true });
    const absent = await t.db
      .select()
      .from(gymAbsentEquipmentTypes)
      .where(eq(gymAbsentEquipmentTypes.gymId, gymId));
    expect(absent.map((row) => row.equipmentTypeId)).toEqual([type.leg_press_45]);
    const slot = await decisionOf(sessionId, workoutExerciseId);
    expect(slot.decision?.resolution.status).toBe("unavailable");
    expect(slot.decision?.ask).toBeNull();
  });

  it("takes A different one to the variant here, as the same movement on it", async () => {
    const { gymId, sessionId, workoutExerciseId } = await slotAt("gym", "leg-press-45");
    const outcome = await as((tx) =>
      chooseEquipmentVariant(
        tx,
        user.id,
        workoutExerciseId,
        type.leg_press_45!,
        type.leg_press_horizontal!,
        "kg",
      ),
    );
    expect(outcome.kind).toBe("switched");
    const slot = await decisionOf(sessionId, workoutExerciseId);
    expect(slot.exercise.slug).toBe("leg-press-horizontal");
    expect(slot.equipment?.name).toBe("Horizontal leg press");
    const absent = await t.db
      .select({ typeId: gymAbsentEquipmentTypes.equipmentTypeId })
      .from(gymAbsentEquipmentTypes)
      .where(eq(gymAbsentEquipmentTypes.gymId, gymId));
    expect(absent).toEqual([{ typeId: type.leg_press_45 }]);
  });

  it("asks nothing of free weights", async () => {
    const { sessionId, workoutExerciseId } = await slotAt("gym", "goblet-squat");
    expect((await decisionOf(sessionId, workoutExerciseId)).decision).toBeNull();
  });
});

describe("any other machine nobody has answered for", () => {
  it("asks Available, Not here or Not sure, and registers it at once on Available", async () => {
    const { gymId, sessionId, workoutExerciseId } = await slotAt("gym", "hack-squat");
    expect((await decisionOf(sessionId, workoutExerciseId)).decision?.ask).toMatchObject({
      kind: "unknown",
      typeId: type.hack_squat,
      family: null,
    });
    await as((tx) => confirmEquipmentHere(tx, user.id, workoutExerciseId, type.hack_squat!, "kg"));
    const slot = await decisionOf(sessionId, workoutExerciseId);
    expect(slot.equipment?.name).toBe("Hack squat");
    const machines = await t.db
      .select()
      .from(equipmentInstances)
      .where(eq(equipmentInstances.gymId, gymId));
    expect(machines).toHaveLength(1);
  });

  it("asks about a registered machine rather than recording an absence over it", async () => {
    const { gymId, workoutExerciseId } = await slotAt("home", "hack-squat");
    const machine = await as((tx) =>
      createEquipment(tx, user.id, gymId, {
        name: "Garage hack squat",
        equipmentTypeId: type.hack_squat!,
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
    expect(
      await as((tx) => markEquipmentNotHere(tx, user.id, workoutExerciseId, type.hack_squat!)),
    ).toEqual({ recorded: false, machines: [{ id: machine.id, name: "Garage hack squat" }] });
    // It has gone: archived with its history, the exercise asks again.
    await as((tx) => archiveWorkoutMachine(tx, user.id, workoutExerciseId, machine.id));
    const [row] = await t.db
      .select({ isActive: equipmentInstances.isActive })
      .from(equipmentInstances)
      .where(eq(equipmentInstances.id, machine.id));
    expect(row?.isActive).toBe(false);
    expect(
      await as((tx) => markEquipmentNotHere(tx, user.id, workoutExerciseId, type.hack_squat!)),
    ).toEqual({ recorded: true });
  });

  it("archives the machine an exercise is on, leaving the exercise to ask again", async () => {
    const { gymId, sessionId, workoutExerciseId } = await slotAt("gym", "hack-squat");
    const { equipmentInstanceId } = await as((tx) =>
      confirmEquipmentHere(tx, user.id, workoutExerciseId, type.hack_squat!, "kg"),
    );
    await as((tx) => archiveWorkoutMachine(tx, user.id, workoutExerciseId, equipmentInstanceId));
    const [slotRow] = await t.db
      .select({ machine: workoutExercises.equipmentInstanceId })
      .from(workoutExercises)
      .where(eq(workoutExercises.id, workoutExerciseId));
    expect(slotRow?.machine).toBeNull();
    // Available again restores the archived machine rather than making a second one.
    await as((tx) => confirmEquipmentHere(tx, user.id, workoutExerciseId, type.hack_squat!, "kg"));
    const machines = await t.db
      .select({ id: equipmentInstances.id, isActive: equipmentInstances.isActive })
      .from(equipmentInstances)
      .where(and(eq(equipmentInstances.gymId, gymId)));
    expect(machines).toEqual([{ id: equipmentInstanceId, isActive: true }]);
    expect((await decisionOf(sessionId, workoutExerciseId)).equipment?.id).toBe(
      equipmentInstanceId,
    );
  });

  it("changes nothing once the session is finished", async () => {
    const { sessionId, workoutExerciseId } = await slotAt("gym", "hack-squat");
    await as((tx) => finishSession(tx, user.id, sessionId, { notes: null, bodyWeightKg: null }));
    await expect(
      as((tx) => confirmEquipmentHere(tx, user.id, workoutExerciseId, type.hack_squat!, "kg")),
    ).rejects.toBeInstanceOf(SessionFinishedError);
  });
});
