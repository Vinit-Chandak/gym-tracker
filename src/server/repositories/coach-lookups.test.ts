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
import { ensureProfile } from "@/server/queries/profile";

import { lookupExercises, lookupMachines } from "./coach-lookups";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
});
afterAll(async () => {
  await t.close();
});

async function athlete() {
  const user = await t.createAuthUser(`${crypto.randomUUID()}@lookups.test`);
  const as = <T>(fn: (db: DbOrTx) => Promise<T>) => withUser(t.db, user.id, fn);
  const gym = await as(async (db) => {
    await ensureProfile(db, { id: user.id, email: user.email });
    const [gym] = await db
      .insert(gyms)
      .values({ userId: user.id, slug: "gym", name: "Anytime", kind: "gym", isDefault: true })
      .returning();
    return gym!;
  });
  return { user, as, gym };
}

const query = { gymId: null, limit: 20, offset: 0 };

it("finds the Bayesian cable curl from the athlete's own words, first", async () => {
  const a = await athlete();
  const found = await a.as((db) =>
    lookupExercises(db, a.user.id, { ...query, q: "Bayesian bicep curls" }),
  );
  expect(found.items[0]).toMatchObject({ slug: "bayesian-cable-curl", available: null });
  // Other curls still come back, below it: a near miss is shown, not dropped.
  expect(found.items.some((item) => item.slug !== "bayesian-cable-curl")).toBe(true);
  const none = await a.as((db) => lookupExercises(db, a.user.id, { ...query, q: "zzzz qqqq" }));
  expect(none).toMatchObject({ total: 0, items: [], hasMore: false });
});

it("checks availability at a location, and finds the athlete's own exercises", async () => {
  const a = await athlete();
  await a.as(async (db) => {
    const [cable] = await db
      .select()
      .from(equipmentTypes)
      .where(eq(equipmentTypes.slug, "cable_station"));
    const [machine] = await db
      .insert(equipmentInstances)
      .values({
        userId: a.user.id,
        gymId: a.gym.id,
        equipmentTypeId: cable!.id,
        name: "Cable tower",
        resistanceMode: "selectorized",
        unit: "kg",
      })
      .returning();
    const [own] = await db
      .insert(exercises)
      .values({
        userId: a.user.id,
        slug: `own-${crypto.randomUUID()}`,
        name: "Vinit rope curl",
        category: "hypertrophy",
        modality: "cable",
        movementPattern: "elbow_flexion",
        primaryMuscles: ["biceps"],
        loadPortability: "equipment_specific",
      })
      .returning();

    const curl = await lookupExercises(db, a.user.id, {
      ...query,
      gymId: a.gym.id,
      q: "bayesian curl",
    });
    expect(curl.items[0]).toMatchObject({
      slug: "bayesian-cable-curl",
      available: true,
      machine: { id: machine!.id, name: "Cable tower" },
    });
    const mine = await lookupExercises(db, a.user.id, { ...query, q: "vinit curls" });
    expect(mine.items[0]).toMatchObject({ slug: own!.slug, own: true });

    const biceps = await lookupExercises(db, a.user.id, {
      ...query,
      gymId: a.gym.id,
      muscle: "biceps",
      availableOnly: true,
      limit: 100,
    });
    expect(biceps.items.length).toBeGreaterThan(0);
    expect(biceps.items.every((item) => item.available && item.muscles.includes("biceps"))).toBe(
      true,
    );
  });
});

it("lists a location's machines with their known loads, and nobody else's", async () => {
  const a = await athlete();
  const b = await athlete();
  await a.as(async (db) => {
    const [type] = await db
      .select()
      .from(equipmentTypes)
      .where(eq(equipmentTypes.slug, "leg_curl_seated"));
    const [machine] = await db
      .insert(equipmentInstances)
      .values({
        userId: a.user.id,
        gymId: a.gym.id,
        equipmentTypeId: type!.id,
        name: "Seated leg curl",
        resistanceMode: "selectorized",
        unit: "kg",
        loadIncrement: 2.5,
      })
      .returning();
    const [exercise] = await db.select().from(exercises).limit(1);
    const [session] = await db
      .insert(workoutSessions)
      .values({ userId: a.user.id, gymId: a.gym.id, startedAt: new Date() })
      .returning();
    const [we] = await db
      .insert(workoutExercises)
      .values({
        userId: a.user.id,
        workoutSessionId: session!.id,
        exerciseId: exercise!.id,
        equipmentInstanceId: machine!.id,
        orderIndex: 0,
      })
      .returning();
    await db.insert(setLogs).values(
      [47, 54, 59].map((weight, index) => ({
        userId: a.user.id,
        workoutExerciseId: we!.id,
        setIndex: index + 1,
        weight,
        unit: "kg" as const,
        reps: 10,
      })),
    );
    const listed = await lookupMachines(db, a.user.id, a.gym.id);
    expect(listed.machines).toEqual([
      expect.objectContaining({
        id: machine!.id,
        typeSlug: "leg_curl_seated",
        stack: true,
        assisted: false,
        known: [47, 54, 59],
        increment: null,
      }),
    ]);
  });
  await b.as(async (db) => {
    await expect(lookupMachines(db, b.user.id, a.gym.id)).rejects.toThrow(/not one of/);
    await expect(
      lookupExercises(db, b.user.id, { ...query, gymId: a.gym.id, q: "curl" }),
    ).rejects.toThrow(/not one of/);
  });
});
