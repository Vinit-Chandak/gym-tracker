import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";

import { equipmentInstances, equipmentTypes, exercises } from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import type { EquipmentInput } from "@/server/validation/gyms";

import {
  addExerciseToSession,
  finishSession,
  getSessionDetail,
  logSet,
  startAdHocSession,
} from "./sessions";
import { registerWorkoutEquipment } from "./workout-equipment";

let t: TestDatabase;
let user: { id: string; email: string };
let gymId: string;
let otherGymId: string;
let exerciseId: string;
let input: EquipmentInput;

beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
  user = await t.createAuthUser("machine-qa@example.test");
  const fixture = await withUser(t.db, user.id, (tx) => seedTestUserData(tx, user));
  gymId = fixture.gymIdBySlug.get("samsung-gym")!;
  otherGymId = fixture.gymIdBySlug.get("society-gym")!;
  const [exercise] = await t.db.select().from(exercises).where(eq(exercises.name, "45° leg press"));
  const [type] = await t.db
    .select()
    .from(equipmentTypes)
    .where(eq(equipmentTypes.slug, "leg_press_45"));
  exerciseId = exercise!.id;
  input = {
    name: "Session leg press",
    equipmentTypeId: type!.id,
    manufacturer: null,
    model: null,
    resistanceMode: "plate_loaded",
    unit: "kg",
    loadIncrement: 2.5,
    pulleyRatio: null,
    angleDegrees: null,
    notes: null,
  };
});
afterAll(async () => t.close());

async function newSlot() {
  return withUser(t.db, user.id, async (tx) => {
    const { sessionId } = await startAdHocSession(tx, user.id, { gymId });
    const { workoutExerciseId } = await addExerciseToSession(tx, user.id, sessionId, {
      exerciseId,
      equipmentInstanceId: null,
    });
    return { sessionId, workoutExerciseId };
  });
}

it("attaches a compatible machine to the exercise that requested it", async () => {
  const target = await newSlot();
  const machine = await withUser(t.db, user.id, (tx) =>
    registerWorkoutEquipment(tx, user.id, gymId, target, input),
  );
  const detail = await withUser(t.db, user.id, (tx) =>
    getSessionDetail(tx, user.id, target.sessionId),
  );
  expect(detail?.exercises[0]?.equipment?.id).toBe(machine.id);
  expect(detail?.exercises[0]?.decision).toBeNull();
});

it("rolls back an incompatible machine instead of saving it and leaving the workout unresolved", async () => {
  const target = await newSlot();
  const [type] = await t.db
    .select()
    .from(equipmentTypes)
    .where(eq(equipmentTypes.slug, "treadmill"));
  await expect(
    withUser(t.db, user.id, (tx) =>
      registerWorkoutEquipment(tx, user.id, gymId, target, {
        ...input,
        name: "Wrong machine",
        equipmentTypeId: type!.id,
      }),
    ),
  ).rejects.toThrow("supports this exercise");
  expect(
    await t.db
      .select()
      .from(equipmentInstances)
      .where(eq(equipmentInstances.name, "Wrong machine")),
  ).toHaveLength(0);
});

it("requires the same user, gym, session and exercise", async () => {
  const target = await newSlot();
  const other = await newSlot();
  for (const [targetGym, invalid] of [
    [otherGymId, target],
    [gymId, { ...target, sessionId: other.sessionId }],
  ] as const) {
    await expect(
      withUser(t.db, user.id, (tx) =>
        registerWorkoutEquipment(tx, user.id, targetGym, invalid, {
          ...input,
          name: "Invalid target",
        }),
      ),
    ).rejects.toThrow("Session not found");
  }
  const stranger = await t.createAuthUser("stranger-qa@example.test");
  await expect(
    withUser(t.db, stranger.id, (tx) =>
      registerWorkoutEquipment(tx, stranger.id, gymId, target, {
        ...input,
        name: "Foreign machine",
      }),
    ),
  ).rejects.toThrow("Session not found");
});

it("does not change the machine under logged sets or create one for a finished workout", async () => {
  const target = await newSlot();
  await withUser(t.db, user.id, (tx) =>
    logSet(tx, user.id, {
      workoutExerciseId: target.workoutExerciseId,
      setIndex: 1,
      setType: "working",
      weight: 80,
      reps: 8,
      rir: 2,
      durationSeconds: null,
    }),
  );
  await expect(
    withUser(t.db, user.id, (tx) =>
      registerWorkoutEquipment(tx, user.id, gymId, target, { ...input, name: "Too late" }),
    ),
  ).rejects.toThrow("Sets are already logged");
  await withUser(t.db, user.id, (tx) =>
    finishSession(tx, user.id, target.sessionId, { notes: null, bodyWeightKg: null }),
  );
  await expect(
    withUser(t.db, user.id, (tx) =>
      registerWorkoutEquipment(tx, user.id, gymId, target, { ...input, name: "Too late" }),
    ),
  ).rejects.toThrow("already finished");
  expect(
    await t.db.select().from(equipmentInstances).where(eq(equipmentInstances.name, "Too late")),
  ).toHaveLength(0);
});
