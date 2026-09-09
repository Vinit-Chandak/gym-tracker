import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { equipmentTypes, exercises, warmupProtocols } from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { listEquipmentTypes } from "@/server/repositories/equipment";
import { listExercises } from "@/server/repositories/exercises";

import {
  equipmentTypeNames,
  getWarmupProtocol,
  resetReferenceCache,
  sharedEquipmentTypes,
  sharedExercises,
} from "./reference";

let t: TestDatabase;
let user: { id: string; email: string };

beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
  user = await t.createAuthUser("reference@example.com");
  resetReferenceCache();
});

afterAll(async () => {
  await t.close();
});

describe("shared reference data", () => {
  it("reads the catalogue once and serves the same rows afterwards", async () => {
    const first = await withUser(t.db, user.id, (tx) => sharedEquipmentTypes(tx));
    const second = await withUser(t.db, user.id, (tx) => sharedEquipmentTypes(tx));
    expect(second).toBe(first);
    const direct = await t.db.select({ id: equipmentTypes.id }).from(equipmentTypes);
    expect(first).toHaveLength(direct.length);
    const names = await withUser(t.db, user.id, (tx) => equipmentTypeNames(tx));
    expect(names.get(first[0]!.id)).toBe(first[0]!.name);
  });

  it("serves equipment types and warm-ups through the repositories unchanged", async () => {
    const types = await withUser(t.db, user.id, (tx) => listEquipmentTypes(tx));
    const stored = await t.db
      .select({ id: equipmentTypes.id, slug: equipmentTypes.slug, name: equipmentTypes.name })
      .from(equipmentTypes)
      .orderBy(equipmentTypes.sortOrder, equipmentTypes.name);
    expect(types.map((type) => type.slug)).toEqual(stored.map((type) => type.slug));

    const [upper] = await t.db
      .select({ id: warmupProtocols.id, name: warmupProtocols.name })
      .from(warmupProtocols)
      .where(eq(warmupProtocols.slug, "upper"));
    const protocol = await withUser(t.db, user.id, (tx) => getWarmupProtocol(tx, upper!.id));
    expect(protocol?.name).toBe(upper!.name);
    expect(protocol?.drills.length).toBeGreaterThan(0);
    expect(await withUser(t.db, user.id, (tx) => getWarmupProtocol(tx, user.id))).toBeNull();
  });

  it("lists the shared library plus the account's own exercises, in name order", async () => {
    const shared = await withUser(t.db, user.id, (tx) => sharedExercises(tx));
    expect(shared.every((row) => row.userId === null)).toBe(true);
    await withUser(t.db, user.id, (tx) =>
      tx.insert(exercises).values({
        userId: user.id,
        slug: `custom-${user.id}`,
        name: "Aardvark curl",
        category: "hypertrophy",
        modality: "dumbbell",
        movementPattern: "curl",
        primaryMuscles: ["biceps"],
        loadPortability: "global",
      }),
    );
    const list = await withUser(t.db, user.id, (tx) => listExercises(tx));
    expect(list).toHaveLength(shared.length + 1);
    const at = list.findIndex((item) => item.isCustom);
    expect(list[at]).toMatchObject({ name: "Aardvark curl", isCustom: true });
    expect(list.filter((item) => item.isCustom)).toHaveLength(1);
    // Slotted into the shared order by name: everything before sorts earlier, after later.
    expect(list.slice(0, at).every((item) => item.name.localeCompare("Aardvark curl") <= 0)).toBe(
      true,
    );
    expect(list.slice(at + 1).every((item) => item.name.localeCompare("Aardvark curl") > 0)).toBe(
      true,
    );
    // The in-memory library never picks up an account's private rows.
    expect(await withUser(t.db, user.id, (tx) => sharedExercises(tx))).toBe(shared);
  });

  it("forgets everything on reset", async () => {
    const before = await withUser(t.db, user.id, (tx) => sharedEquipmentTypes(tx));
    resetReferenceCache();
    const after = await withUser(t.db, user.id, (tx) => sharedEquipmentTypes(tx));
    expect(after).not.toBe(before);
    expect(after).toEqual(before);
  });
});
