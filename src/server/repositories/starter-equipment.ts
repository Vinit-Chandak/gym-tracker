import { and, eq } from "drizzle-orm";

import { equipmentInstances, gymAbsentEquipmentTypes } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { BodyLoadUnit, TrainingExperience } from "@/domain/types";
import { buildMachinesStep, type MachinesStep } from "@/lib/machines-step";
import {
  assumedTypeIds,
  sharedCombinations,
  sharedEquipmentTypes,
  sharedPresets,
  type EquipmentTypeRow,
} from "@/server/queries/reference";
import type { EquipmentInput } from "@/server/validation/gyms";

import { instanceTypeIds } from "./equipment-context";
import { clearAbsences, createEquipment, GymNotFoundError, setEquipmentActive } from "./equipment";
import { getGym } from "./gyms";

/*
 * The machines step (plan: onboarding flow): what a location is suggested to have, and the one
 * transaction that records what the athlete confirmed. Equipment is identified by gym and type,
 * never by name, so resubmitting, renaming or archiving never duplicates a machine.
 */

/** What a confirmed type is registered as: named after it, with the catalogue's defaults. */
export function defaultMachineInput(
  type: Pick<EquipmentTypeRow, "id" | "name" | "defaultResistanceMode" | "defaultUnit">,
  preferredUnit: BodyLoadUnit,
  name: string = type.name,
): EquipmentInput {
  return {
    name,
    equipmentTypeId: type.id,
    manufacturer: null,
    model: null,
    resistanceMode: type.defaultResistanceMode,
    // The catalogue states weights in kilograms; a machine is logged in the unit its owner
    // reads. Cardio and other unitless kinds keep their own default.
    unit: type.defaultUnit === "kg" ? preferredUnit : type.defaultUnit,
    loadIncrement: null,
    availableLoads: [],
    loadConvention: "unknown",
    pulleyRatio: null,
    angleDegrees: null,
    notes: null,
  };
}

/** The base name, or the base with the first free number after it ("Leg press 2"). */
export function freeMachineName(taken: ReadonlySet<string>, base: string): string {
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

type GymMachine = { id: string; name: string; isActive: boolean; typeIds: string[] };

async function gymMachines(db: DbOrTx, userId: string, gymId: string): Promise<GymMachine[]> {
  const rows = await db
    .select({
      id: equipmentInstances.id,
      name: equipmentInstances.name,
      isActive: equipmentInstances.isActive,
      typeId: equipmentInstances.equipmentTypeId,
      typeIds: instanceTypeIds,
    })
    .from(equipmentInstances)
    .where(and(eq(equipmentInstances.gymId, gymId), eq(equipmentInstances.userId, userId)))
    .orderBy(equipmentInstances.name);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    isActive: row.isActive,
    typeIds: row.typeIds.length > 0 ? row.typeIds : [row.typeId],
  }));
}

export type StarterChoices = {
  /** Types confirmed here, a family's chosen variant included. */
  typeIds: readonly string[];
  /** Combination machines confirmed here: one machine carrying every type. */
  combinationIds: readonly string[];
  /** The gym basics marked not here; every other basic counts as here again. */
  notHereTypeIds: readonly string[];
};

export type StarterOutcome = { created: number; restored: number; notHere: number };

export class StarterChoiceError extends Error {
  constructor() {
    super("Something in the selection is not in the catalogue. Reload the page and try again.");
    this.name = "StarterChoiceError";
  }
}

/**
 * Records the machines step in one transaction. For each confirmed type: an active machine
 * with it means nothing is created; else an archived one is restored, keeping its history; else
 * one machine is created, named after the type. A combination is one machine with every type,
 * unless the gym already has each of them. Confirmed types are no longer recorded as missing.
 * At a gym, the basics marked not here are recorded as absent and the others are not, except
 * that a basic on an active machine is here whatever was ticked: presence wins.
 */
export async function confirmStarterEquipment(
  db: DbOrTx,
  userId: string,
  gymId: string,
  preferredUnit: BodyLoadUnit,
  choices: StarterChoices,
): Promise<StarterOutcome> {
  const gym = await getGym(db, userId, gymId);
  if (!gym) throw new GymNotFoundError();
  const [types, combinations, basics, machines] = await Promise.all([
    sharedEquipmentTypes(db),
    sharedCombinations(db),
    gym.kind === "gym" ? assumedTypeIds(db, gym.kind) : Promise.resolve(new Set<string>()),
    gymMachines(db, userId, gymId),
  ]);
  const typeById = new Map(types.map((type) => [type.id, type]));
  const chosenTypes = [...new Set(choices.typeIds)];
  const chosenCombinations = [...new Set(choices.combinationIds)].map((id) =>
    combinations.find((combination) => combination.id === id),
  );
  if (chosenTypes.some((id) => !typeById.has(id)) || chosenCombinations.some((c) => !c))
    throw new StarterChoiceError();

  const active = new Set(machines.filter((m) => m.isActive).flatMap((m) => m.typeIds));
  const taken = new Set(machines.map((machine) => machine.name.toLowerCase()));
  const outcome: StarterOutcome = { created: 0, restored: 0, notHere: 0 };

  const restoreCovering = async (typeIds: readonly string[]) => {
    const archived = machines.find(
      (machine) => !machine.isActive && typeIds.every((id) => machine.typeIds.includes(id)),
    );
    if (!archived) return false;
    await setEquipmentActive(db, userId, archived.id, true);
    archived.isActive = true;
    for (const id of archived.typeIds) active.add(id);
    outcome.restored += 1;
    return true;
  };

  for (const typeId of chosenTypes) {
    if (active.has(typeId) || (await restoreCovering([typeId]))) continue;
    const type = typeById.get(typeId)!;
    const name = freeMachineName(taken, type.name);
    await createEquipment(db, userId, gymId, defaultMachineInput(type, preferredUnit, name));
    taken.add(name.toLowerCase());
    active.add(typeId);
    outcome.created += 1;
  }
  for (const combination of chosenCombinations) {
    const members = combination!.typeIds.filter((id) => typeById.has(id));
    if (members.length === 0 || members.every((id) => active.has(id))) continue;
    if (await restoreCovering(members)) continue;
    const [display, ...also] = members;
    const name = freeMachineName(taken, combination!.name);
    await createEquipment(
      db,
      userId,
      gymId,
      defaultMachineInput(typeById.get(display!)!, preferredUnit, name),
      also,
    );
    taken.add(name.toLowerCase());
    for (const id of members) active.add(id);
    outcome.created += 1;
  }
  await clearAbsences(db, userId, gymId, [...active]);

  if (gym.kind === "gym") {
    const notHere = choices.notHereTypeIds.filter((id) => basics.has(id) && !active.has(id));
    const here = [...basics].filter((id) => !notHere.includes(id));
    await clearAbsences(db, userId, gymId, here);
    if (notHere.length > 0)
      await db
        .insert(gymAbsentEquipmentTypes)
        .values(notHere.map((equipmentTypeId) => ({ userId, gymId, equipmentTypeId })))
        .onConflictDoNothing({
          target: [gymAbsentEquipmentTypes.gymId, gymAbsentEquipmentTypes.equipmentTypeId],
        });
    outcome.notHere = notHere.length;
  }
  return outcome;
}

/* ---------------------------------------------------------------- what the step shows */

/** What the machines step shows for a location, for the athlete's answer to "Which sounds like you?". */
export async function machinesStep(
  db: DbOrTx,
  userId: string,
  gymId: string,
  experience: TrainingExperience | null,
): Promise<MachinesStep | null> {
  const gym = await getGym(db, userId, gymId);
  if (!gym) return null;
  const [types, combinations, presets, basics, machines, absences] = await Promise.all([
    sharedEquipmentTypes(db),
    sharedCombinations(db),
    sharedPresets(db),
    gym.kind === "gym" ? assumedTypeIds(db, gym.kind) : Promise.resolve(new Set<string>()),
    gymMachines(db, userId, gymId),
    db
      .select({ typeId: gymAbsentEquipmentTypes.equipmentTypeId })
      .from(gymAbsentEquipmentTypes)
      .where(
        and(eq(gymAbsentEquipmentTypes.gymId, gymId), eq(gymAbsentEquipmentTypes.userId, userId)),
      ),
  ]);
  return buildMachinesStep({
    gym: { id: gym.id, name: gym.name, kind: gym.kind },
    experience,
    types,
    combinations,
    presets,
    basics,
    machines,
    absentTypeIds: absences.map((row) => row.typeId),
  });
}
