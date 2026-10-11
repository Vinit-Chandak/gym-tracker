import { and, eq, isNull } from "drizzle-orm";
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
import { recentPerformances, sessionHistories } from "@/server/queries/comparable";
import { ensureProfile } from "@/server/queries/profile";

import { readExerciseLife } from "./exercise-life";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
});
afterAll(async () => {
  await t.close();
});

async function athlete() {
  const user = await t.createAuthUser(`${crypto.randomUUID()}@life.test`);
  const as = <T>(fn: (db: DbOrTx) => Promise<T>) => withUser(t.db, user.id, fn);
  const gym = await as(async (db) => {
    await ensureProfile(db, { id: user.id, email: user.email });
    const [gym] = await db
      .insert(gyms)
      .values({ userId: user.id, slug: "gym", name: "Gym", kind: "gym", isDefault: true })
      .returning();
    return gym!;
  });
  const machine = async (db: DbOrTx, slug: string, name?: string) => {
    const [type] = await db.select().from(equipmentTypes).where(eq(equipmentTypes.slug, slug));
    const [row] = await db
      .insert(equipmentInstances)
      .values({
        userId: user.id,
        gymId: gym.id,
        equipmentTypeId: type!.id,
        name: name ?? type!.name,
        resistanceMode: "selectorized",
        unit: "kg",
      })
      .returning();
    return row!;
  };
  /** A finished session of `exerciseSlug` on `machineId`, one working set per weight. */
  const log = async (
    db: DbOrTx,
    exerciseSlug: string,
    machineId: string | null,
    startedAt: string,
    weights: number[],
  ) => {
    const [exercise] = await db.select().from(exercises).where(eq(exercises.slug, exerciseSlug));
    const [session] = await db
      .insert(workoutSessions)
      .values({
        userId: user.id,
        gymId: gym.id,
        startedAt: new Date(startedAt),
        completedAt: new Date(startedAt),
      })
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
        unit: "kg" as const,
        reps: 8,
      })),
    );
    return exercise!;
  };
  return { user, as, machine, log };
}

it("reads an assisted machine's best month as its least help, and any other as its heaviest", async () => {
  const a = await athlete();
  await a.as(async (db) => {
    const assist = await a.machine(db, "assisted_pullup");
    const pulldown = await a.machine(db, "lat_pulldown");
    await a.log(db, "assisted-pull-up", assist.id, "2026-01-10T08:00:00Z", [40, 35, 35]);
    const pullUp = await a.log(
      db,
      "assisted-pull-up",
      assist.id,
      "2026-09-10T08:00:00Z",
      [20, 15, 15],
    );
    const lat = await a.log(db, "lat-pulldown", pulldown.id, "2026-09-10T08:00:00Z", [50, 55]);

    const assisted = await readExerciseLife(db, a.user.id, pullUp.id, "UTC", assist.id);
    expect(assisted).toMatchObject({ assisted: true, sessions: 2 });
    expect(assisted.months).toEqual([
      { month: "2026-01", topKg: 35 },
      { month: "2026-09", topKg: 15 },
    ]);
    const plain = await readExerciseLife(db, a.user.id, lat.id, "UTC", pulldown.id);
    expect(plain).toMatchObject({ assisted: false, months: [{ month: "2026-09", topKg: 55 }] });
  });
});

it("takes a machine's starting guess from another machine, never from its own old session", async () => {
  const a = await athlete();
  await a.as(async (db) => {
    const mine = await a.machine(db, "lat_pulldown");
    const other = await a.machine(db, "lat_pulldown", "Lat pulldown by the window");
    const lat = await a.log(db, "lat-pulldown", other.id, "2026-06-01T08:00:00Z", [45]);
    await a.log(db, "lat-pulldown", null, "2026-06-15T08:00:00Z", [47.5]);
    await a.log(db, "lat-pulldown", mine.id, "2026-07-01T08:00:00Z", [50]);
    const [read] = await sessionHistories(db, [
      {
        userId: a.user.id,
        exerciseId: lat.id,
        loadPortability: "equipment_specific",
        equipmentInstanceId: mine.id,
      },
    ]);
    expect(read!.history.map((h) => h.equipmentInstanceId)).toEqual([mine.id]);
    // The newest elsewhere is the one done before a machine was chosen; this machine's is not.
    expect(read!.elsewhere).toMatchObject({ equipmentInstanceId: null });
    expect(read!.elsewhere?.sets[0]?.weight).toBe(47.5);
  });
});

it("reads an exercise's page on the machine its graph draws, with other machines apart", async () => {
  const a = await athlete();
  await a.as(async (db) => {
    const pulldown = await a.machine(db, "lat_pulldown");
    const cable = await a.machine(db, "cable_station");
    for (const day of ["2026-09-03", "2026-09-17", "2026-09-24"])
      await a.log(db, "lat-pulldown", pulldown.id, `${day}T08:00:00Z`, [40, 42.5]);
    // Done last on another machine, and once on one nobody recorded.
    await a.log(db, "lat-pulldown", null, "2026-10-05T08:00:00Z", [20]);
    const lat = await a.log(db, "lat-pulldown", cable.id, "2026-10-07T08:00:00Z", [17.5, 37.5]);
    const day = (performance: { performedAt: Date }) =>
      performance.performedAt.toISOString().slice(0, 10);

    const onPulldown = await recentPerformances(db, a.user.id, lat.id, {
      equipmentInstanceId: pulldown.id,
    });
    expect(onPulldown.scoped.map(day)).toEqual(["2026-09-24", "2026-09-17", "2026-09-03"]);
    expect(onPulldown.elsewhere.map((p) => p.equipmentInstanceId)).toEqual([cable.id, null]);
    // The pulldown's own figures, not the cable station's it was last done on.
    expect(
      await readExerciseLife(db, a.user.id, lat.id, "UTC", pulldown.id, { unit: "kg" }),
    ).toMatchObject({ sessions: 3, months: [{ month: "2026-09", topKg: 42.5 }] });
    // In another unit there is nothing: a stack's numbers are not kilograms.
    expect(
      await readExerciseLife(db, a.user.id, lat.id, "UTC", pulldown.id, { unit: "stack_index" }),
    ).toMatchObject({ sessions: 0, months: [] });

    // A machine nobody recorded is a series of its one workout.
    const [unrecorded] = await db
      .select({ id: workoutExercises.id })
      .from(workoutExercises)
      .where(
        and(eq(workoutExercises.userId, a.user.id), isNull(workoutExercises.equipmentInstanceId)),
      );
    const alone = await recentPerformances(db, a.user.id, lat.id, {
      workoutExerciseId: unrecorded!.id,
    });
    expect(alone.scoped.map(day)).toEqual(["2026-10-05"]);
    expect(alone.elsewhere).toHaveLength(4);
    expect(
      await readExerciseLife(db, a.user.id, lat.id, "UTC", null, {
        workoutExerciseId: unrecorded!.id,
        unit: "kg",
      }),
    ).toMatchObject({ sessions: 1, months: [{ month: "2026-10", topKg: 20 }] });

    // A movement whose load means the same everywhere is read on any equipment, in one list.
    const anywhere = await recentPerformances(db, a.user.id, lat.id);
    expect(anywhere.scoped).toHaveLength(5);
    expect(anywhere.elsewhere).toEqual([]);
  });
});
