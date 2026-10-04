import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  equipmentCombinations,
  equipmentInstances,
  equipmentTypes,
  gymAbsentEquipmentTypes,
  gyms,
} from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { ensureProfile } from "@/server/queries/profile";
import { resetReferenceCache } from "@/server/queries/reference";

import { machineTypeIds, setEquipmentActive } from "./equipment";
import {
  confirmStarterEquipment,
  freeMachineName,
  machinesStep,
  StarterChoiceError,
} from "./starter-equipment";

/*
 * The machines step's one transaction (plan: onboarding flow, item 6), on a real database:
 * equipment identified by gym and type, archived machines restored, combinations as one machine,
 * the basics' absences, and nothing doubled however often it is sent.
 */

let t: TestDatabase;
let user: { id: string; email: string };
let gymId: string;
let homeId: string;
const type: Record<string, string> = {};
let latRow: string;

const as = <T>(fn: (tx: Parameters<Parameters<typeof withUser>[2]>[0]) => Promise<T>) =>
  withUser(t.db, user.id, fn);

const confirm = (at: string, choices: Partial<Parameters<typeof confirmStarterEquipment>[4]>) =>
  as((tx) =>
    confirmStarterEquipment(tx, user.id, at, "kg", {
      typeIds: [],
      combinationIds: [],
      notHereTypeIds: [],
      ...choices,
    }),
  );

async function machinesAt(at: string) {
  return t.db
    .select({
      id: equipmentInstances.id,
      name: equipmentInstances.name,
      isActive: equipmentInstances.isActive,
      typeId: equipmentInstances.equipmentTypeId,
      unit: equipmentInstances.unit,
    })
    .from(equipmentInstances)
    .where(eq(equipmentInstances.gymId, at))
    .orderBy(equipmentInstances.name);
}

async function absentAt(at: string) {
  const rows = await t.db
    .select({ typeId: gymAbsentEquipmentTypes.equipmentTypeId })
    .from(gymAbsentEquipmentTypes)
    .where(eq(gymAbsentEquipmentTypes.gymId, at));
  return rows.map((row) => row.typeId).sort();
}

beforeAll(async () => {
  t = await createTestDatabase();
  resetReferenceCache();
  await seedReferenceData(t.db);
  resetReferenceCache();
  user = await t.createAuthUser("starter@example.com");
  await as((tx) => ensureProfile(tx, user));
  const [gym, home] = await as((tx) =>
    tx
      .insert(gyms)
      .values([
        { userId: user.id, name: "Local gym", slug: "local-gym", kind: "gym" },
        { userId: user.id, name: "Home", slug: "home", kind: "home" },
      ])
      .returning({ id: gyms.id }),
  );
  gymId = gym!.id;
  homeId = home!.id;
  for (const row of await t.db.select().from(equipmentTypes)) type[row.slug] = row.id;
  const [combo] = await t.db
    .select({ id: equipmentCombinations.id })
    .from(equipmentCombinations)
    .where(eq(equipmentCombinations.slug, "lat_pulldown_low_row"));
  latRow = combo!.id;
});

afterAll(async () => {
  await t.close();
});

describe("confirming the machines step", () => {
  it("creates one machine per confirmed type, named after it, and nothing more when sent again", async () => {
    const choices = { typeIds: [type.hack_squat!, type.smith_machine!] };
    expect(await confirm(gymId, choices)).toEqual({ created: 2, restored: 0, notHere: 0 });
    expect(await confirm(gymId, choices)).toEqual({ created: 0, restored: 0, notHere: 0 });
    expect((await machinesAt(gymId)).map((m) => m.name)).toEqual(["Hack squat", "Smith machine"]);
  });

  it("identifies a machine by its type, so a renamed one is not doubled", async () => {
    const [hack] = (await machinesAt(gymId)).filter((m) => m.name === "Hack squat");
    await as((tx) =>
      tx
        .update(equipmentInstances)
        .set({ name: "The hack" })
        .where(eq(equipmentInstances.id, hack!.id)),
    );
    await confirm(gymId, { typeIds: [type.hack_squat!] });
    expect((await machinesAt(gymId)).filter((m) => m.typeId === type.hack_squat)).toHaveLength(1);
  });

  it("restores an archived machine, keeping it, rather than recreating or ignoring it", async () => {
    const [smith] = (await machinesAt(gymId)).filter((m) => m.name === "Smith machine");
    await as((tx) => setEquipmentActive(tx, user.id, smith!.id, false));
    expect(await confirm(gymId, { typeIds: [type.smith_machine!] })).toEqual({
      created: 0,
      restored: 1,
      notHere: 0,
    });
    const after = (await machinesAt(gymId)).filter((m) => m.typeId === type.smith_machine);
    expect(after).toEqual([expect.objectContaining({ id: smith!.id, isActive: true })]);
  });

  it("registers a combination as one machine with every type, named after it", async () => {
    await confirm(gymId, { combinationIds: [latRow] });
    const [machine] = (await machinesAt(gymId)).filter(
      (m) => m.name === "Lat pulldown and low row",
    );
    expect(machine?.typeId).toBe(type.lat_pulldown);
    expect((await as((tx) => machineTypeIds(tx, user.id, machine!.id))).sort()).toEqual(
      [type.lat_pulldown!, type.seated_row_cable!].sort(),
    );
    // Sent again, or once both halves are here, it adds nothing.
    expect(await confirm(gymId, { combinationIds: [latRow] })).toMatchObject({ created: 0 });
  });

  it("records the basics marked not here, and counts the rest as here again", async () => {
    await confirm(gymId, { notHereTypeIds: [type.pec_deck!, type.leg_curl_seated!] });
    expect(await absentAt(gymId)).toEqual([type.leg_curl_seated!, type.pec_deck!].sort());
    await confirm(gymId, { notHereTypeIds: [type.pec_deck!] });
    expect(await absentAt(gymId)).toEqual([type.pec_deck!]);
  });

  it("lets presence win: a basic on an active machine is never marked not here", async () => {
    // The combination above registered the lat pulldown.
    await confirm(gymId, { notHereTypeIds: [type.pec_deck!, type.lat_pulldown!] });
    expect(await absentAt(gymId)).toEqual([type.pec_deck!]);
  });

  it("clears a confirmed type's absence, and ignores basics at home, where nothing is assumed", async () => {
    await as((tx) =>
      tx
        .insert(gymAbsentEquipmentTypes)
        .values({ userId: user.id, gymId: homeId, equipmentTypeId: type.dumbbells! }),
    );
    await confirm(homeId, { typeIds: [type.dumbbells!], notHereTypeIds: [type.barbell!] });
    expect(await absentAt(homeId)).toEqual([]);
    expect((await machinesAt(homeId)).map((m) => [m.name, m.unit])).toEqual([["Dumbbells", "kg"]]);
  });

  it("refuses what is not in the catalogue, and another account's gym", async () => {
    await expect(
      confirm(gymId, { typeIds: ["00000000-0000-4000-8000-000000000000"] }),
    ).rejects.toBeInstanceOf(StarterChoiceError);
    const other = await t.createAuthUser("starter-other@example.com");
    await withUser(t.db, other.id, (tx) => ensureProfile(tx, other));
    await expect(
      withUser(t.db, other.id, (tx) =>
        confirmStarterEquipment(tx, other.id, gymId, "kg", {
          typeIds: [type.hack_squat!],
          combinationIds: [],
          notHereTypeIds: [],
        }),
      ),
    ).rejects.toThrow();
    const [mine] = await t.db
      .select({ n: equipmentInstances.id })
      .from(equipmentInstances)
      .where(and(eq(equipmentInstances.userId, other.id)));
    expect(mine).toBeUndefined();
  });
});

describe("what the machines step shows", () => {
  it("shows a revisit what the gym already has, has archived and lacks", async () => {
    const step = await as((tx) => machinesStep(tx, user.id, gymId, "new"));
    expect(step?.activeTypeIds).toEqual(
      expect.arrayContaining([type.hack_squat, type.smith_machine, type.lat_pulldown]),
    );
    expect(step?.absentTypeIds).toEqual([type.pec_deck]);
    expect(step?.basics).toHaveLength(18);
    expect(step?.suggestions.length).toBeGreaterThanOrEqual(8);
  });
});

describe("free machine names", () => {
  it("numbers a name already taken, ignoring case", () => {
    expect(freeMachineName(new Set(["leg press"]), "Leg press")).toBe("Leg press 2");
    expect(freeMachineName(new Set(["leg press", "leg press 2"]), "Leg press")).toBe("Leg press 3");
    expect(freeMachineName(new Set(), "Leg press")).toBe("Leg press");
  });
});
