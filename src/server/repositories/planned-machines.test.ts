import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";

import {
  equipmentInstances,
  equipmentTypes,
  exercises,
  programDays,
  programExercises,
  programs,
} from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";

import { setPreferredMachine } from "./exercises";
import { listGyms } from "./gyms";
import {
  discardSession,
  finishSession,
  getSessionDetail,
  logSet,
  startPlannedSession,
  substituteExercise,
} from "./sessions";

/*
 * Two machines of one kind at a gym (owner, October 2026): a planned exercise goes on the one it
 * was last done on there; never done on either, the workout asks which, instead of every session
 * putting it on whichever comes first by name and filing one machine's loads under the other's.
 */

let t: TestDatabase;
let user: { id: string; email: string };
let gymId = "";
let exerciseId = "";
let pecDeck = "";
let upstairs = "";

const as = <T>(fn: (tx: Parameters<Parameters<typeof withUser>[2]>[0]) => Promise<T>) =>
  withUser(t.db, user.id, fn);

/** Starts the day that plans the reverse pec deck, and returns its row. */
async function start() {
  const [slot] = await t.db
    .select({ id: programExercises.id, dayId: programDays.id })
    .from(programExercises)
    .innerJoin(programDays, eq(programDays.id, programExercises.programDayId))
    .innerJoin(programs, eq(programs.id, programDays.programId))
    .where(
      and(
        eq(programs.userId, user.id),
        eq(programs.status, "active"),
        eq(programExercises.exerciseId, exerciseId),
      ),
    )
    .limit(1);
  const { sessionId } = await as((tx) =>
    startPlannedSession(tx, user.id, { gymId, programDayId: slot!.dayId, cycleIndex: 1 }),
  );
  const detail = await as((tx) => getSessionDetail(tx, user.id, sessionId));
  const row = detail!.exercises.find((e) => e.planned?.programExerciseId === slot!.id)!;
  return { sessionId, row };
}

beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
  user = await t.createAuthUser("planned-machines@example.com");
  await as((tx) => seedTestUserData(tx, user));
  gymId = (await as((tx) => listGyms(tx, user.id))).find((g) => g.slug === "anytime-fitness")!.id;
  const [exercise] = await t.db
    .select({ id: exercises.id })
    .from(exercises)
    .where(eq(exercises.slug, "reverse-pec-deck"));
  exerciseId = exercise!.id;
  const [type] = await t.db
    .select({ id: equipmentTypes.id })
    .from(equipmentTypes)
    .where(eq(equipmentTypes.slug, "pec_deck"));
  // The fixture's "Pec deck", and a second one that comes after it by name.
  const [second] = await as((tx) =>
    tx
      .insert(equipmentInstances)
      .values({
        userId: user.id,
        gymId,
        equipmentTypeId: type!.id,
        name: "Pec deck (upstairs)",
        resistanceMode: "selectorized",
      })
      .returning({ id: equipmentInstances.id }),
  );
  upstairs = second!.id;
  const [first] = await t.db
    .select({ id: equipmentInstances.id })
    .from(equipmentInstances)
    .where(and(eq(equipmentInstances.gymId, gymId), eq(equipmentInstances.name, "Pec deck")));
  pecDeck = first!.id;
});

afterAll(async () => {
  await t.close();
});

it("asks which machine when nobody chose one and it was never done on either", async () => {
  const { sessionId, row } = await start();
  expect(row.equipment).toBeNull();
  // The workout asks, offering both by name.
  expect(row.decision?.resolution.status).toBe("direct");
  expect(row.decision?.machines.map((m) => m.name).sort()).toEqual([
    "Pec deck",
    "Pec deck (upstairs)",
  ]);
  await as((tx) => discardSession(tx, user.id, sessionId));
});

it("puts it on the machine it was last done on at this gym", async () => {
  const { sessionId, row } = await start();
  // Done on the second machine, the one that is not first by name.
  await as(async (tx) => {
    await substituteExercise(tx, user.id, {
      workoutExerciseId: row.id,
      exerciseId,
      equipmentInstanceId: upstairs,
      reason: "Pec deck (upstairs)",
    });
    await logSet(tx, user.id, {
      workoutExerciseId: row.id,
      setIndex: 1,
      setType: "working",
      weight: 40,
      reps: 12,
      rir: 2,
      durationSeconds: null,
    });
    await finishSession(tx, user.id, sessionId, { notes: null, bodyWeightKg: null });
  });
  const next = await start();
  expect(next.row.equipment?.id).toBe(upstairs);
  // On its machine, there is nothing to ask.
  expect(next.row.decision).toBeNull();
  await as((tx) => discardSession(tx, user.id, next.sessionId));
});

it("keeps to a machine the athlete chose for the exercise here", async () => {
  await as((tx) => setPreferredMachine(tx, user.id, exerciseId, gymId, pecDeck));
  const { sessionId, row } = await start();
  expect(row.equipment?.id).toBe(pecDeck);
  await as((tx) => discardSession(tx, user.id, sessionId));
  await as((tx) => setPreferredMachine(tx, user.id, exerciseId, gymId, null));
});
