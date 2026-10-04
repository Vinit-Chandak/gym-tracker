import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  equipmentInstances,
  equipmentTypes,
  exercises,
  gymAbsentEquipmentTypes,
  gyms,
} from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { BLUEPRINT_VERSION, programBlueprintSchema } from "@/domain/program-blueprint";
import { resetReferenceCache } from "@/server/queries/reference";

import { markEquipmentAbsent } from "./absent-equipment";
import { decideExerciseAtGym } from "./availability";
import { libraryAtGym } from "./coach-plans";
import { lookupExercises } from "./coach-lookups";
import {
  createEquipment,
  DisplayTypeError,
  machinesByExerciseAtGym,
  setEquipmentActive,
  setMachineAlsoUsedFor,
} from "./equipment";
import { listGyms } from "./gyms";
import { backupRuleProblems, validateBlueprintForAthlete } from "./program-drafts";

/*
 * The availability rules of ADR 0041 end to end against a real database: presence and absence
 * reconciled, machines with several types, which machines an exercise is offered, and the
 * coach's backup rule on a programme.
 */

let t: TestDatabase;
let user: { id: string; email: string };
let freshGym: string;
let homeId: string;

async function idOf(table: "type" | "exercise", slug: string): Promise<string> {
  const [row] =
    table === "type"
      ? await t.db
          .select({ id: equipmentTypes.id })
          .from(equipmentTypes)
          .where(eq(equipmentTypes.slug, slug))
      : await t.db.select({ id: exercises.id }).from(exercises).where(eq(exercises.slug, slug));
  if (!row) throw new Error(`no ${table} ${slug}`);
  return row.id;
}

const as = <T>(fn: Parameters<typeof withUser<T>>[2]) => withUser(t.db, user.id, fn);

function machineInput(typeId: string, name: string) {
  return {
    name,
    equipmentTypeId: typeId,
    manufacturer: null,
    model: null,
    resistanceMode: "selectorized" as const,
    unit: "kg" as const,
    loadIncrement: null,
    availableLoads: [],
    loadConvention: "unknown" as const,
    pulleyRatio: null,
    angleDegrees: null,
    notes: null,
  };
}

async function absences(gymId: string): Promise<string[]> {
  const rows = await t.db
    .select({ typeId: gymAbsentEquipmentTypes.equipmentTypeId })
    .from(gymAbsentEquipmentTypes)
    .where(eq(gymAbsentEquipmentTypes.gymId, gymId));
  return rows.map((row) => row.typeId);
}

beforeAll(async () => {
  t = await createTestDatabase();
  resetReferenceCache();
  await seedReferenceData(t.db);
  resetReferenceCache();
  user = await t.createAuthUser("rules@example.com");
  await as((tx) => seedTestUserData(tx, user));
  const [gym] = await as((tx) =>
    tx
      .insert(gyms)
      .values({ userId: user.id, name: "Fresh gym", slug: "fresh-gym", kind: "gym" })
      .returning({ id: gyms.id }),
  );
  freshGym = gym!.id;
  homeId = (await as((tx) => listGyms(tx, user.id))).find((g) => g.slug === "home")!.id;
});

afterAll(async () => {
  await t.close();
});

describe("presence and absence", () => {
  it("clears a type's absence when a machine of it is registered", async () => {
    const hackSquat = await idOf("type", "hack_squat");
    expect(await as((tx) => markEquipmentAbsent(tx, user.id, freshGym, hackSquat))).toEqual({
      recorded: true,
    });
    expect(await absences(freshGym)).toContain(hackSquat);
    await as((tx) => createEquipment(tx, user.id, freshGym, machineInput(hackSquat, "Hack squat")));
    expect(await absences(freshGym)).not.toContain(hackSquat);
  });

  it("asks rather than records when an active machine has the type, and restoring clears it", async () => {
    const hackSquat = await idOf("type", "hack_squat");
    const outcome = await as((tx) => markEquipmentAbsent(tx, user.id, freshGym, hackSquat));
    expect(outcome).toMatchObject({ recorded: false, machines: [{ name: "Hack squat" }] });
    expect(await absences(freshGym)).not.toContain(hackSquat);

    const [machine] = await t.db
      .select({ id: equipmentInstances.id })
      .from(equipmentInstances)
      .where(
        and(eq(equipmentInstances.gymId, freshGym), eq(equipmentInstances.name, "Hack squat")),
      );
    // Archived (history kept), the type can be marked missing; restored, it is here again.
    await as((tx) => setEquipmentActive(tx, user.id, machine!.id, false));
    expect(await as((tx) => markEquipmentAbsent(tx, user.id, freshGym, hackSquat))).toEqual({
      recorded: true,
    });
    await as((tx) => setEquipmentActive(tx, user.id, machine!.id, true));
    expect(await absences(freshGym)).not.toContain(hackSquat);
  });
});

describe("machines with several types", () => {
  it("lets one machine carry a lat pulldown and a low row, keeping its own display type", async () => {
    const lat = await idOf("type", "lat_pulldown");
    const row = await idOf("type", "seated_row_cable");
    const machine = await as((tx) =>
      createEquipment(tx, user.id, freshGym, machineInput(lat, "Lat and row"), [row]),
    );
    const compatible = await as((tx) => machinesByExerciseAtGym(tx, user.id, freshGym));
    expect(compatible[await idOf("exercise", "lat-pulldown")]).toContain(machine.id);
    expect(compatible[await idOf("exercise", "seated-cable-row")]).toContain(machine.id);
    await expect(
      as((tx) => setMachineAlsoUsedFor(tx, user.id, machine.id, lat, false)),
    ).rejects.toBeInstanceOf(DisplayTypeError);
    await as((tx) => setMachineAlsoUsedFor(tx, user.id, machine.id, row, false));
    const after = await as((tx) => machinesByExerciseAtGym(tx, user.id, freshGym));
    expect(after[await idOf("exercise", "seated-cable-row")] ?? []).not.toContain(machine.id);
  });

  it("adds a type through Also used for, clearing that type's absence", async () => {
    const pecDeck = await idOf("type", "pec_deck");
    const rearDelt = await idOf("type", "rear_delt_machine");
    await as((tx) => markEquipmentAbsent(tx, user.id, freshGym, rearDelt));
    const machine = await as((tx) =>
      createEquipment(tx, user.id, freshGym, machineInput(pecDeck, "Dual pec deck")),
    );
    await as((tx) => setMachineAlsoUsedFor(tx, user.id, machine.id, rearDelt, true));
    expect(await absences(freshGym)).not.toContain(rearDelt);
    const compatible = await as((tx) => machinesByExerciseAtGym(tx, user.id, freshGym));
    expect(compatible[await idOf("exercise", "rear-delt-machine")]).toContain(machine.id);
  });
});

describe("which machines an exercise is offered", () => {
  it("never offers a bench as a Smith hip thrust's machine", async () => {
    const bench = await idOf("type", "flat_bench");
    const smith = await idOf("type", "smith_machine");
    const benchRow = await as((tx) =>
      createEquipment(tx, user.id, homeId, machineInput(bench, "Home bench")),
    );
    const hipThrust = await idOf("exercise", "smith-hip-thrust");
    let compatible = await as((tx) => machinesByExerciseAtGym(tx, user.id, homeId));
    expect(compatible[hipThrust] ?? []).not.toContain(benchRow.id);
    const smithRow = await as((tx) =>
      createEquipment(tx, user.id, homeId, machineInput(smith, "Home Smith")),
    );
    compatible = await as((tx) => machinesByExerciseAtGym(tx, user.id, homeId));
    expect(compatible[hipThrust]).toEqual([smithRow.id]);
    const decision = await as((tx) => decideExerciseAtGym(tx, user.id, homeId, hipThrust, null));
    expect(decision?.resolution).toMatchObject({
      status: "direct",
      basis: "confirmed",
      equipmentInstance: { id: smithRow.id },
    });
  });

  it("no longer offers the assisted dip machine for a plain dip", async () => {
    const assisted = await idOf("type", "dip_machine");
    const machine = await as((tx) =>
      createEquipment(tx, user.id, freshGym, machineInput(assisted, "Assisted dip")),
    );
    const compatible = await as((tx) => machinesByExerciseAtGym(tx, user.id, freshGym));
    expect(compatible[await idOf("exercise", "dip")] ?? []).not.toContain(machine.id);
    expect(compatible[await idOf("exercise", "assisted-dip")]).toContain(machine.id);
  });
});

describe("the coach's view and backup rule", () => {
  it("tells the coach confirmed, assumed, unknown, absent or none", async () => {
    const library = await as((tx) => libraryAtGym(tx, user.id, freshGym));
    const state = (slug: string) => library.find((e) => e.slug === slug)?.equipment;
    expect(state("hack-squat")).toBe("confirmed");
    expect(state("leg-extension")).toBe("assumed");
    expect(state("pendulum-squat")).toBe("unknown");
    expect(state("push-up")).toBe("none");
    const lookup = await as((tx) =>
      lookupExercises(tx, user.id, { q: "leg extension", gymId: freshGym, limit: 1, offset: 0 }),
    );
    expect(lookup.items[0]).toMatchObject({ slug: "leg-extension", equipment: "assumed" });
  });

  it("plans basics without a backup, others only with one available now, absent never", async () => {
    const day = (exercises: object[]) =>
      programBlueprintSchema.parse({
        blueprintVersion: BLUEPRINT_VERSION,
        slug: "rules-test",
        name: "Rules",
        weeks: 1,
        days: [
          {
            dayIndex: 1,
            dayOfWeek: 1,
            name: "Day",
            includesLifting: true,
            includesRun: false,
            exercises,
          },
        ],
        runs: [],
      });
    const slot = (exerciseSlug: string, fallbacks?: object[]) => ({
      exerciseSlug,
      sets: 3,
      reps: [8, 12],
      rir: [1, 2],
      rest: [90, 120],
      ...(fallbacks ? { fallbacks } : {}),
    });
    const library = await as((tx) => libraryAtGym(tx, user.id, freshGym));
    expect(backupRuleProblems(day([slot("leg-extension"), slot("hack-squat")]), library)).toEqual({
      absent: [],
      unbacked: [],
    });
    expect(backupRuleProblems(day([slot("pendulum-squat")]), library).unbacked).toEqual([
      "Pendulum squat",
    ]);
    expect(
      backupRuleProblems(
        day([slot("pendulum-squat", [{ exerciseSlug: "leg-press-45", rank: 1 }])]),
        library,
      ),
    ).toEqual({ absent: [], unbacked: [] });
    const hipThrust = await idOf("type", "hip_thrust_machine");
    await as((tx) => markEquipmentAbsent(tx, user.id, freshGym, hipThrust));
    await expect(
      as((tx) =>
        validateBlueprintForAthlete(tx, user.id, day([slot("hip-thrust-machine")]), freshGym),
      ),
    ).rejects.toThrow(/marked as not at the selected location: Hip thrust/);
    await expect(
      as((tx) => validateBlueprintForAthlete(tx, user.id, day([slot("pendulum-squat")]), freshGym)),
    ).rejects.toThrow(/nobody has confirmed/);
    await expect(
      as((tx) =>
        validateBlueprintForAthlete(
          tx,
          user.id,
          day([
            slot("leg-extension"),
            slot("pendulum-squat", [{ exerciseSlug: "goblet-squat", rank: 1 }]),
          ]),
          freshGym,
        ),
      ),
    ).resolves.toBeTruthy();
  });

  it("assumes nothing at home: only confirmed equipment or none needs no backup", async () => {
    const library = await as((tx) => libraryAtGym(tx, user.id, homeId));
    const state = (slug: string) => library.find((e) => e.slug === slug)?.equipment;
    expect(state("leg-extension")).toBe("unknown");
    expect(state("push-up")).toBe("none");
    // The home bench and Smith machine registered above.
    expect(state("smith-hip-thrust")).toBe("confirmed");
  });
});
