import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { equipmentInstances, equipmentTypes, exercises } from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";

import { listAbsentEquipment, markEquipmentAbsent } from "./absent-equipment";
import {
  exerciseAvailability,
  gymAvailability,
  type PlannedExerciseAvailability,
} from "./availability";
import { listEquipmentForGym } from "./equipment";
import { getExercise, listExercises, setPreferredMachine } from "./exercises";
import { addGymFallback, listGymFallbacks, removeGymFallback } from "./fallbacks";
import { getGym, listGyms } from "./gyms";

let t: TestDatabase;
let user: { id: string; email: string };
let anytimeId: string;
let samsungId: string;
let outdoorId: string;

function row(rows: PlannedExerciseAvailability[], slug: string): PlannedExerciseAvailability {
  const found = rows.find((r) => r.exercise.slug === slug);
  if (!found) throw new Error(`no row for ${slug}`);
  return found;
}

async function exerciseId(slug: string): Promise<string> {
  const [row] = await t.db
    .select({ id: exercises.id })
    .from(exercises)
    .where(eq(exercises.slug, slug));
  if (!row) throw new Error(`no exercise ${slug}`);
  return row.id;
}

async function typeId(slug: string): Promise<string> {
  const [row] = await t.db
    .select({ id: equipmentTypes.id })
    .from(equipmentTypes)
    .where(eq(equipmentTypes.slug, slug));
  if (!row) throw new Error(`no type ${slug}`);
  return row.id;
}

beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
  user = await t.createAuthUser("avail@example.com");
  await withUser(t.db, user.id, (tx) => seedTestUserData(tx, user));
  const gyms = await withUser(t.db, user.id, (tx) => listGyms(tx, user.id));
  const bySlug = new Map(gyms.map((g) => [g.slug, g.id]));
  anytimeId = bySlug.get("anytime-fitness") ?? "";
  samsungId = bySlug.get("samsung-gym") ?? "";
  outdoorId = bySlug.get("outdoor") ?? "";
});

afterAll(async () => {
  await t.close();
});

describe("planned-exercise availability", () => {
  it("preserves resolutions when detail pages reuse their existing rows", async () => {
    const id = await exerciseId("leg-press-45");
    await withUser(t.db, user.id, async (tx) => {
      const [gym, equipment, absent] = await Promise.all([
        getGym(tx, user.id, anytimeId),
        listEquipmentForGym(tx, user.id, anytimeId),
        listAbsentEquipment(tx, user.id, anytimeId),
      ]);
      if (!gym) throw new Error("no gym");
      const expected = await gymAvailability(tx, user.id, anytimeId);
      expect(
        await gymAvailability(tx, user.id, anytimeId, {
          gym,
          equipment: equipment.map((item) => ({
            id: item.id,
            gymId: anytimeId,
            name: item.name,
            isActive: item.isActive,
            equipmentTypeId: item.typeId,
          })),
          absentEquipmentTypeIds: new Set(absent.map((item) => item.equipmentTypeId)),
        }),
      ).toEqual(expected);
      const exercise = await getExercise(tx, user.id, id);
      if (!exercise) throw new Error("no exercise");
      expect(await exerciseAvailability(tx, user.id, id, exercise)).toEqual(
        await exerciseAvailability(tx, user.id, id),
      );
    });
  });

  it("resolves the seeded programme at Anytime Fitness", async () => {
    const result = await withUser(t.db, user.id, (tx) => gymAvailability(tx, user.id, anytimeId));
    if (!result) throw new Error("no result");
    expect(result.program?.name).toContain("8-Week");
    // 37 slots collapse to one row per distinct exercise.
    expect(result.rows.length).toBeLessThan(37);
    expect(row(result.rows, "pull-up").days).toEqual(["Upper A", "Upper B"]);

    expect(row(result.rows, "barbell-bench-press").resolution).toMatchObject({
      status: "direct",
      equipmentInstance: null,
    });
    expect(row(result.rows, "smith-machine-calf-raise").resolution).toMatchObject({
      status: "direct",
      equipmentInstance: { name: "Smith machine" },
    });
    expect(row(result.rows, "leg-press-45").resolution).toMatchObject({
      status: "direct",
      equipmentInstance: { name: "45° leg press" },
    });
    expect(row(result.rows, "reverse-pec-deck").resolution).toMatchObject({
      status: "direct",
      equipmentInstance: { name: "Pec deck" },
    });
    expect(row(result.rows, "lat-pulldown").resolution).toMatchObject({
      status: "direct",
      equipmentInstance: { name: "Cable station" },
    });

    const legExtension = row(result.rows, "leg-extension");
    expect(legExtension.resolution.status).toBe("unknown");
    expect(legExtension.missingTypes.map((m) => m.name)).toEqual(["Leg extension"]);

    expect(result.summary.direct).toBeGreaterThan(10);
    expect(result.summary.unknown).toBeGreaterThan(0);
    expect(
      result.summary.direct +
        result.summary.fallback +
        result.summary.unknown +
        result.summary.unavailable,
    ).toBe(result.rows.length);
  });

  it("reports unknown at an empty gym and unavailable outdoors", async () => {
    const samsung = await withUser(t.db, user.id, (tx) => gymAvailability(tx, user.id, samsungId));
    if (!samsung) throw new Error("no result");
    expect(row(samsung.rows, "barbell-bench-press").resolution.status).toBe("direct");
    expect(row(samsung.rows, "smith-machine-calf-raise").resolution.status).toBe("unknown");
    expect(row(samsung.rows, "smith-machine-calf-raise").missingTypes.map((m) => m.name)).toEqual([
      "Smith machine",
      "45° leg press",
      "Horizontal leg press",
    ]);
    expect(samsung.summary.unavailable).toBe(0);

    const outdoor = await withUser(t.db, user.id, (tx) => gymAvailability(tx, user.id, outdoorId));
    if (!outdoor) throw new Error("no result");
    expect(row(outdoor.rows, "leg-extension").resolution.status).toBe("unavailable");
    expect(row(outdoor.rows, "side-plank").resolution.status).toBe("direct");
    expect(outdoor.summary.unknown).toBe(0);
  });

  it("turns unknown into unavailable once the gym is marked as lacking the equipment", async () => {
    const legExtensionType = await typeId("leg_extension");
    await withUser(t.db, user.id, (tx) =>
      markEquipmentAbsent(tx, user.id, samsungId, legExtensionType),
    );
    const samsung = await withUser(t.db, user.id, (tx) => gymAvailability(tx, user.id, samsungId));
    expect(row(samsung?.rows ?? [], "leg-extension").resolution.status).toBe("unavailable");
  });

  it("applies a gym-specific fallback to every slot of the exercise and can remove it again", async () => {
    const legExtension = await exerciseId("leg-extension");
    const splitSquat = await exerciseId("split-squat");
    const updated = await withUser(t.db, user.id, (tx) =>
      addGymFallback(tx, user.id, {
        gymId: samsungId,
        exerciseId: legExtension,
        fallbackExerciseId: splitSquat,
        fallbackEquipmentInstanceId: null,
      }),
    );
    expect(updated).toBe(1);
    const samsung = await withUser(t.db, user.id, (tx) => gymAvailability(tx, user.id, samsungId));
    const r = row(samsung?.rows ?? [], "leg-extension");
    expect(r.resolution.status).toBe("fallback");
    expect(r.resolvedExerciseName).toBe("Split squat (supported)");
    expect(r.gymFallbacks).toHaveLength(1);

    // The fallback is scoped to Samsung Gym only.
    const anytime = await withUser(t.db, user.id, (tx) => gymAvailability(tx, user.id, anytimeId));
    expect(row(anytime?.rows ?? [], "leg-extension").resolution.status).toBe("unknown");

    const listed = await withUser(t.db, user.id, (tx) => listGymFallbacks(tx, user.id, samsungId));
    expect(listed).toHaveLength(1);
    const removed = await withUser(t.db, user.id, (tx) =>
      removeGymFallback(tx, user.id, listed[0]?.id ?? ""),
    );
    expect(removed).toBe(true);
    const after = await withUser(t.db, user.id, (tx) => gymAvailability(tx, user.id, samsungId));
    expect(row(after?.rows ?? [], "leg-extension").resolution.status).toBe("unavailable");
  });

  it("uses the preferred machine at a gym for an exercise", async () => {
    const pecDeckFly = await exerciseId("pec-deck-fly");
    const pecDeckType = await typeId("pec_deck");
    const [second] = await withUser(t.db, user.id, (tx) =>
      tx
        .insert(equipmentInstances)
        .values({
          userId: user.id,
          gymId: anytimeId,
          equipmentTypeId: pecDeckType,
          name: "Pec deck (upstairs)",
          resistanceMode: "selectorized",
        })
        .returning({ id: equipmentInstances.id }),
    );
    if (!second) throw new Error("insert failed");

    const before = await withUser(t.db, user.id, (tx) =>
      exerciseAvailability(tx, user.id, pecDeckFly),
    );
    const anytimeBefore = before.find((g) => g.gym.id === anytimeId);
    expect(anytimeBefore?.resolution).toMatchObject({
      status: "direct",
      equipmentInstance: { name: "Pec deck" },
    });
    expect(anytimeBefore?.machines.map((m) => m.name)).toContain("Pec deck (upstairs)");
    expect(anytimeBefore?.preferredInstanceId).toBeNull();

    await withUser(t.db, user.id, (tx) =>
      setPreferredMachine(tx, user.id, pecDeckFly, anytimeId, second.id),
    );
    const after = await withUser(t.db, user.id, (tx) =>
      exerciseAvailability(tx, user.id, pecDeckFly),
    );
    const anytimeAfter = after.find((g) => g.gym.id === anytimeId);
    expect(anytimeAfter?.resolution).toMatchObject({
      status: "direct",
      equipmentInstance: { id: second.id },
    });
    expect(anytimeAfter?.preferredInstanceId).toBe(second.id);

    await withUser(t.db, user.id, (tx) =>
      setPreferredMachine(tx, user.id, pecDeckFly, anytimeId, null),
    );
    const cleared = await withUser(t.db, user.id, (tx) =>
      exerciseAvailability(tx, user.id, pecDeckFly),
    );
    expect(cleared.find((g) => g.gym.id === anytimeId)?.preferredInstanceId).toBeNull();
    // Only real, active gyms are listed.
    expect(cleared.map((g) => g.gym.name).sort()).toEqual([
      "Anytime Fitness",
      "Samsung Gym",
      "Society Gym",
    ]);
  });

  it("lists the whole library, shared rows marked as not custom", async () => {
    const list = await withUser(t.db, user.id, (tx) => listExercises(tx));
    expect(list.length).toBeGreaterThan(40);
    expect(list.every((e) => !e.isCustom)).toBe(true);
    // Nothing in the shared library is switched off: it is everybody's library, not one plan's.
    expect(list.every((e) => e.isActive)).toBe(true);
  });
});
