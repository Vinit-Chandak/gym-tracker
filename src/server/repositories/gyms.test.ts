import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedReferenceData } from "@/db/seed/reference";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";

import {
  createEquipment,
  EquipmentNameTakenError,
  listEquipmentForGym,
  listEquipmentTypes,
  updateEquipment,
} from "./equipment";
import { createGym, getGym, listGyms, setDefaultGym, setGymActive, updateGym } from "./gyms";

let t: TestDatabase;
let user: { id: string; email: string };

const gymInput = (name: string, kind: "gym" | "outdoor" | "home" = "gym") => ({
  name,
  kind,
  address: null,
  notes: null,
});

beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
  user = await t.createAuthUser("gyms@example.com");
});

afterAll(async () => {
  await t.close();
});

describe("gym repository", () => {
  it("creates gyms with unique slugs and makes the first real gym the default", async () => {
    const [first, second, outdoor] = await withUser(t.db, user.id, async (tx) => [
      await createGym(tx, user.id, gymInput("Samsung Gym")),
      await createGym(tx, user.id, gymInput("Samsung Gym")),
      await createGym(tx, user.id, gymInput("Outdoor", "outdoor")),
    ]);
    expect(first.slug).toBe("samsung-gym");
    expect(second.slug).toBe("samsung-gym-2");
    expect(first.isDefault).toBe(true);
    expect(second.isDefault).toBe(false);
    expect(outdoor.isDefault).toBe(false);
  });

  it("keeps exactly one default when switching", async () => {
    const list = await withUser(t.db, user.id, (tx) => listGyms(tx, user.id));
    const second = list.find((g) => g.slug === "samsung-gym-2");
    if (!second) throw new Error("missing gym");
    const ok = await withUser(t.db, user.id, (tx) => setDefaultGym(tx, user.id, second.id));
    expect(ok).toBe(true);
    const after = await withUser(t.db, user.id, (tx) => listGyms(tx, user.id));
    expect(after.filter((g) => g.isDefault).map((g) => g.slug)).toEqual(["samsung-gym-2"]);
    // Default and active gyms sort first.
    expect(after[0]?.slug).toBe("samsung-gym-2");
  });

  it("archiving the default gym clears the default flag and refuses to default an archived gym", async () => {
    const list = await withUser(t.db, user.id, (tx) => listGyms(tx, user.id));
    const current = list.find((g) => g.isDefault);
    if (!current) throw new Error("no default");
    await withUser(t.db, user.id, (tx) => setGymActive(tx, user.id, current.id, false));
    const archived = await withUser(t.db, user.id, (tx) => getGym(tx, user.id, current.id));
    expect(archived).toMatchObject({ isActive: false, isDefault: false });
    expect(await withUser(t.db, user.id, (tx) => setDefaultGym(tx, user.id, current.id))).toBe(
      false,
    );
    await withUser(t.db, user.id, (tx) => setGymActive(tx, user.id, current.id, true));
  });

  it("updates names without changing the slug", async () => {
    const list = await withUser(t.db, user.id, (tx) => listGyms(tx, user.id));
    const gym = list.find((g) => g.slug === "samsung-gym");
    if (!gym) throw new Error("missing gym");
    const updated = await withUser(t.db, user.id, (tx) =>
      updateGym(tx, user.id, gym.id, { ...gymInput("Samsung Gym (Tower B)"), notes: "Basement" }),
    );
    expect(updated).toMatchObject({
      name: "Samsung Gym (Tower B)",
      slug: "samsung-gym",
      notes: "Basement",
    });
  });

  it("returns null for gyms the user does not own", async () => {
    const stranger = await t.createAuthUser("stranger@example.com");
    const list = await withUser(t.db, user.id, (tx) => listGyms(tx, user.id));
    const gym = list[0];
    if (!gym) throw new Error("missing gym");
    expect(await withUser(t.db, stranger.id, (tx) => getGym(tx, stranger.id, gym.id))).toBeNull();
  });
});

describe("equipment repository", () => {
  it("adds machines to a gym, counts them, and rejects duplicate names case-insensitively", async () => {
    const [gym] = await withUser(t.db, user.id, (tx) => listGyms(tx, user.id));
    if (!gym) throw new Error("missing gym");
    const types = await withUser(t.db, user.id, (tx) => listEquipmentTypes(tx));
    const latPulldown = types.find((ty) => ty.slug === "lat_pulldown");
    if (!latPulldown) throw new Error("missing type");
    const input = {
      name: "Precor lat pulldown",
      equipmentTypeId: latPulldown.id,
      manufacturer: "Precor",
      model: null,
      resistanceMode: "selectorized" as const,
      unit: "kg" as const,
      loadIncrement: 2.5,
      pulleyRatio: null,
      angleDegrees: null,
      notes: null,
    };
    const created = await withUser(t.db, user.id, (tx) =>
      createEquipment(tx, user.id, gym.id, input),
    );
    expect(created.loadIncrement).toBe(2.5);

    await expect(
      withUser(t.db, user.id, (tx) =>
        createEquipment(tx, user.id, gym.id, { ...input, name: "precor LAT pulldown" }),
      ),
    ).rejects.toBeInstanceOf(EquipmentNameTakenError);

    const second = await withUser(t.db, user.id, (tx) =>
      createEquipment(tx, user.id, gym.id, { ...input, name: "Precor lat pulldown #2" }),
    );
    // Renaming to your own current name is fine; renaming onto another machine is not.
    expect(
      await withUser(t.db, user.id, (tx) =>
        updateEquipment(tx, user.id, second.id, { ...input, name: "Precor lat pulldown #2" }),
      ),
    ).not.toBeNull();
    await expect(
      withUser(t.db, user.id, (tx) => updateEquipment(tx, user.id, second.id, input)),
    ).rejects.toBeInstanceOf(EquipmentNameTakenError);

    const list = await withUser(t.db, user.id, (tx) => listEquipmentForGym(tx, user.id, gym.id));
    expect(list.map((e) => e.name)).toEqual(["Precor lat pulldown", "Precor lat pulldown #2"]);
    expect(list[0]?.typeName).toBe("Lat pulldown");
    const gyms = await withUser(t.db, user.id, (tx) => listGyms(tx, user.id));
    expect(gyms.find((g) => g.id === gym.id)?.equipmentCount).toBe(2);
  });
});
