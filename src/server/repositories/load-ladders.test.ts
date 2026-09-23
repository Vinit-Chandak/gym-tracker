import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";

import {
  equipmentInstances,
  equipmentTypes,
  exercises,
  gyms,
  setLogs,
  workoutExercises,
  workoutSessions,
} from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import type { DbOrTx } from "@/db/types";
import { stepHarder } from "@/domain/load-steps";
import { ensureProfile } from "@/server/queries/profile";

import { confirmMachineLoad, loadLadders } from "./load-ladders";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
});
afterAll(async () => {
  await t.close();
});

async function athlete() {
  const user = await t.createAuthUser(`${crypto.randomUUID()}@ladders.test`);
  const as = <T>(fn: (db: DbOrTx) => Promise<T>) => withUser(t.db, user.id, fn);
  const gym = await as(async (db) => {
    await ensureProfile(db, { id: user.id, email: user.email });
    const [gym] = await db
      .insert(gyms)
      .values({ userId: user.id, slug: "gym", name: "Gym", kind: "gym", isDefault: true })
      .returning();
    return gym!;
  });
  // Each helper runs in the caller's transaction: the one above is closed by now.
  const machine = async (
    db: DbOrTx,
    slug: string,
    resistanceMode: "selectorized" | "plate_loaded",
  ) => {
    const [type] = await db.select().from(equipmentTypes).where(eq(equipmentTypes.slug, slug));
    const [row] = await db
      .insert(equipmentInstances)
      .values({
        userId: user.id,
        gymId: gym.id,
        equipmentTypeId: type!.id,
        name: type!.name,
        resistanceMode,
        unit: "kg",
        loadIncrement: 2.5,
      })
      .returning();
    return row!;
  };
  const log = async (
    db: DbOrTx,
    machineId: string,
    weights: (number | null)[],
    unit: "kg" | "lb" = "kg",
  ) => {
    const [exercise] = await db.select().from(exercises).limit(1);
    const [session] = await db
      .insert(workoutSessions)
      .values({ userId: user.id, gymId: gym.id, startedAt: new Date() })
      .returning();
    const [we] = await db
      .insert(workoutExercises)
      .values({
        userId: user.id,
        workoutSessionId: session!.id,
        exerciseId: exercise!.id,
        equipmentInstanceId: machineId,
        orderIndex: 0,
      })
      .returning();
    await db.insert(setLogs).values(
      weights.map((weight, index) => ({
        userId: user.id,
        workoutExerciseId: we!.id,
        setIndex: index + 1,
        weight,
        unit,
        reps: 10,
      })),
    );
  };
  return { user, as, machine, log };
}

it("reads a stack's stops from every weight logged on it, and nothing from plates", async () => {
  const a = await athlete();
  await a.as(async (db) => {
    const legCurl = await a.machine(db, "leg_curl_seated", "selectorized");
    const pullUp = await a.machine(db, "assisted_pullup", "selectorized");
    const legPress = await a.machine(db, "leg_press_horizontal", "plate_loaded");
    await a.log(db, legCurl.id, [47, 54, 59, null, 0]);
    await a.log(db, legCurl.id, [54, 59]);
    // A set logged in another unit is not a stop on a kilogram stack.
    await a.log(db, legCurl.id, [130], "lb");
    await a.log(db, pullUp.id, [30, 25]);
    await a.log(db, legPress.id, [100, 120]);

    const ladders = await loadLadders(db, a.user.id, [legCurl.id, pullUp.id, legPress.id]);
    const curl = ladders.get(legCurl.id)!;
    expect(curl).toMatchObject({ known: [47, 54, 59], stack: true, assisted: false });
    expect(stepHarder(curl, 59)).toEqual({ load: 64, source: "learned" });
    expect(ladders.get(pullUp.id)).toMatchObject({ known: [25, 30], assisted: true });
    expect(stepHarder(ladders.get(pullUp.id)!, 25)).toEqual({ load: 20, source: "learned" });
    expect(ladders.get(legPress.id)).toMatchObject({ known: [], stack: false, increment: 2.5 });

    // The Next up box: a stop the athlete names becomes a known one.
    expect(await confirmMachineLoad(db, a.user.id, legCurl.id, 64)).toEqual([64]);
    const after = (await loadLadders(db, a.user.id, [legCurl.id])).get(legCurl.id)!;
    expect(stepHarder(after, 59)).toEqual({ load: 64, source: "known" });
    expect(stepHarder(after, 64)).toEqual({ load: 69, source: "learned" });
  });
});

it("never reads another athlete's machine", async () => {
  const a = await athlete();
  const b = await athlete();
  const theirs = await b.as(async (db) => {
    const machine = await b.machine(db, "leg_curl_seated", "selectorized");
    await b.log(db, machine.id, [40, 45]);
    return machine;
  });
  await a.as(async (db) => {
    expect((await loadLadders(db, a.user.id, [theirs.id])).size).toBe(0);
    expect(await confirmMachineLoad(db, a.user.id, theirs.id, 50)).toBeNull();
  });
});
