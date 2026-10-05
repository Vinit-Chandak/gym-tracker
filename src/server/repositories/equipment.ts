import { and, asc, desc, eq, inArray, isNull, ne, notExists, sql } from "drizzle-orm";

import { isUniqueViolation } from "@/db/errors";
import {
  equipmentInstances,
  equipmentInstanceTypes,
  equipmentTypes,
  exerciseEquipmentOptions,
  exercises,
  gymAbsentEquipmentTypes,
  gyms,
  setLogs,
  workoutExercises,
  workoutSessions,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { compatibleMachines, inventoryAt } from "@/domain/equipment-resolution";
import { sharedEquipmentTypes, sharedExercises } from "@/server/queries/reference";
import type { EquipmentInput } from "@/server/validation/gyms";

import { instanceTypeIds, referenceInputs, referenceSets } from "./equipment-context";
import { getGym } from "./gyms";

export type EquipmentTypeOption = {
  id: string;
  slug: string;
  name: string;
  category: typeof equipmentTypes.$inferSelect.category;
  defaultResistanceMode: typeof equipmentTypes.$inferSelect.defaultResistanceMode;
  defaultUnit: typeof equipmentTypes.$inferSelect.defaultUnit;
};

/** The shared catalogue, in its display order. Served from memory after the first read. */
export async function listEquipmentTypes(db: DbOrTx): Promise<EquipmentTypeOption[]> {
  return (await sharedEquipmentTypes(db)).map((type) => ({
    id: type.id,
    slug: type.slug,
    name: type.name,
    category: type.category,
    defaultResistanceMode: type.defaultResistanceMode,
    defaultUnit: type.defaultUnit,
  }));
}

export type EquipmentListItem = {
  id: string;
  name: string;
  isActive: boolean;
  resistanceMode: typeof equipmentInstances.$inferSelect.resistanceMode;
  unit: typeof equipmentInstances.$inferSelect.unit;
  loadIncrement: number | null;
  manufacturer: string | null;
  model: string | null;
  typeId: string;
  typeName: string;
  typeCategory: typeof equipmentTypes.$inferSelect.category;
  /** Every type the machine is, its display type included. */
  typeIds: string[];
};

/** Equipment at one gym: active first, then by name. */
export async function listEquipmentForGym(
  db: DbOrTx,
  userId: string,
  gymId: string,
): Promise<EquipmentListItem[]> {
  return db
    .select({
      id: equipmentInstances.id,
      name: equipmentInstances.name,
      isActive: equipmentInstances.isActive,
      resistanceMode: equipmentInstances.resistanceMode,
      unit: equipmentInstances.unit,
      loadIncrement: equipmentInstances.loadIncrement,
      manufacturer: equipmentInstances.manufacturer,
      model: equipmentInstances.model,
      typeId: equipmentTypes.id,
      typeName: equipmentTypes.name,
      typeCategory: equipmentTypes.category,
      typeIds: instanceTypeIds,
    })
    .from(equipmentInstances)
    .innerJoin(equipmentTypes, eq(equipmentTypes.id, equipmentInstances.equipmentTypeId))
    .where(and(eq(equipmentInstances.gymId, gymId), eq(equipmentInstances.userId, userId)))
    .orderBy(desc(equipmentInstances.isActive), asc(equipmentInstances.name));
}

/**
 * Which of a gym's active machines each exercise can actually be done on.
 *
 * One read of the gym's machines for the whole catalogue rather than a lookup per exercise:
 * the pickers use it to decide whether a machine question is worth asking at all. An exercise
 * with exactly one option does not need a picker, and one with none should not be offered a
 * list of machines it cannot use. A machine is offered for the primary type of an alternative
 * nothing absent rules out (ADR 0041), so a bench that only supports a Smith hip thrust is
 * never its machine, and a combination machine counts for each of its types.
 */
export async function machinesByExerciseAtGym(
  db: DbOrTx,
  userId: string,
  gymId: string,
): Promise<Record<string, string[]>> {
  const [[gym], machines, absentRows, ownOptions, ownExercises, shared, refs] = await Promise.all([
    db
      .select({ kind: gyms.kind })
      .from(gyms)
      .where(and(eq(gyms.id, gymId), eq(gyms.userId, userId)))
      .limit(1),
    db
      .select({
        id: equipmentInstances.id,
        gymId: equipmentInstances.gymId,
        equipmentTypeId: equipmentInstances.equipmentTypeId,
        name: equipmentInstances.name,
        isActive: equipmentInstances.isActive,
        typeIds: instanceTypeIds,
      })
      .from(equipmentInstances)
      .where(
        and(
          eq(equipmentInstances.gymId, gymId),
          eq(equipmentInstances.userId, userId),
          eq(equipmentInstances.isActive, true),
        ),
      ),
    db
      .select({ equipmentTypeId: gymAbsentEquipmentTypes.equipmentTypeId })
      .from(gymAbsentEquipmentTypes)
      .where(
        and(eq(gymAbsentEquipmentTypes.gymId, gymId), eq(gymAbsentEquipmentTypes.userId, userId)),
      ),
    // This account's own instance-level rows: preferred machines and custom exercises' machines.
    db
      .select({
        exerciseId: exerciseEquipmentOptions.exerciseId,
        equipmentTypeId: exerciseEquipmentOptions.equipmentTypeId,
        equipmentInstanceId: exerciseEquipmentOptions.equipmentInstanceId,
        preferenceRank: exerciseEquipmentOptions.preferenceRank,
      })
      .from(exerciseEquipmentOptions)
      .where(eq(exerciseEquipmentOptions.userId, userId)),
    db
      .select({
        id: exercises.id,
        modality: exercises.modality,
        requiresEquipment: exercises.requiresEquipment,
      })
      .from(exercises)
      .where(eq(exercises.userId, userId)),
    sharedExercises(db),
    referenceSets(db),
  ]);
  if (!gym || machines.length === 0) return {};
  const inputs = referenceInputs(refs, gym.kind);
  const inventory = inventoryAt(gymId, machines, {
    absent: new Set(absentRows.map((row) => row.equipmentTypeId)),
    assumed: inputs.assumedEquipmentTypeIds,
    free: inputs.freeEquipmentTypeIds,
  });
  const byExercise: Record<string, string[]> = {};
  for (const exercise of [...shared, ...ownExercises]) {
    const compatible = compatibleMachines(
      exercise,
      inventory,
      inputs.requirements,
      ownOptions,
      inputs.modalityTypeIds,
    );
    if (compatible.length > 0) byExercise[exercise.id] = compatible.map((machine) => machine.id);
  }
  return byExercise;
}

export type EquipmentDetail = typeof equipmentInstances.$inferSelect & {
  typeName: string;
  typeSlug: string;
  gymName: string;
};

export async function getEquipment(
  db: DbOrTx,
  userId: string,
  equipmentId: string,
): Promise<EquipmentDetail | null> {
  const [row] = await db
    .select({
      equipment: equipmentInstances,
      typeName: equipmentTypes.name,
      typeSlug: equipmentTypes.slug,
      gymName: gyms.name,
    })
    .from(equipmentInstances)
    .innerJoin(equipmentTypes, eq(equipmentTypes.id, equipmentInstances.equipmentTypeId))
    .innerJoin(gyms, eq(gyms.id, equipmentInstances.gymId))
    .where(and(eq(equipmentInstances.id, equipmentId), eq(equipmentInstances.userId, userId)))
    .limit(1);
  if (!row) return null;
  return { ...row.equipment, typeName: row.typeName, typeSlug: row.typeSlug, gymName: row.gymName };
}

export class GymNotFoundError extends Error {
  constructor() {
    super("Gym not found");
    this.name = "GymNotFoundError";
  }
}

export class EquipmentNameTakenError extends Error {
  constructor(name: string) {
    super(`"${name}" already exists at this gym. Add a number or a detail to tell them apart.`);
    this.name = "EquipmentNameTakenError";
  }
}

async function assertNameFree(
  db: DbOrTx,
  gymId: string,
  name: string,
  excludeId: string | null,
): Promise<void> {
  const [clash] = await db
    .select({ id: equipmentInstances.id })
    .from(equipmentInstances)
    .where(
      and(
        eq(equipmentInstances.gymId, gymId),
        sql`lower(${equipmentInstances.name}) = lower(${name})`,
        excludeId ? ne(equipmentInstances.id, excludeId) : undefined,
      ),
    )
    .limit(1);
  if (clash) throw new EquipmentNameTakenError(name);
}

function toColumns(input: EquipmentInput) {
  return {
    name: input.name,
    equipmentTypeId: input.equipmentTypeId,
    manufacturer: input.manufacturer,
    model: input.model,
    resistanceMode: input.resistanceMode,
    unit: input.unit,
    loadIncrement: input.loadIncrement,
    availableLoads: input.availableLoads,
    loadConvention: input.loadConvention,
    pulleyRatio: input.pulleyRatio,
    angleDegrees: input.angleDegrees,
    notes: input.notes,
  };
}

/**
 * A machine is here, so none of its types is absent any more (ADR 0041). Registering, restoring
 * or extending a machine calls this in the same transaction, so presence and absence never
 * disagree for long enough to be read.
 */
export async function clearAbsences(
  db: DbOrTx,
  userId: string,
  gymId: string,
  equipmentTypeIds: readonly string[],
): Promise<void> {
  if (equipmentTypeIds.length === 0) return;
  await db
    .delete(gymAbsentEquipmentTypes)
    .where(
      and(
        eq(gymAbsentEquipmentTypes.userId, userId),
        eq(gymAbsentEquipmentTypes.gymId, gymId),
        inArray(gymAbsentEquipmentTypes.equipmentTypeId, [...equipmentTypeIds]),
      ),
    );
}

/** Every type a machine is, its display type first. */
export async function machineTypeIds(
  db: DbOrTx,
  userId: string,
  equipmentId: string,
): Promise<string[]> {
  const [machine] = await db
    .select({ typeId: equipmentInstances.equipmentTypeId, typeIds: instanceTypeIds })
    .from(equipmentInstances)
    .where(and(eq(equipmentInstances.id, equipmentId), eq(equipmentInstances.userId, userId)))
    .limit(1);
  if (!machine) return [];
  return [machine.typeId, ...machine.typeIds.filter((id) => id !== machine.typeId)];
}

export async function createEquipment(
  db: DbOrTx,
  userId: string,
  gymId: string,
  input: EquipmentInput,
  /** More types the machine is, beyond its display type: a combination machine's other halves. */
  alsoTypeIds: readonly string[] = [],
): Promise<typeof equipmentInstances.$inferSelect> {
  const gym = await getGym(db, userId, gymId);
  if (!gym) throw new GymNotFoundError();
  await assertNameFree(db, gymId, input.name, null);
  try {
    const [row] = await db
      .insert(equipmentInstances)
      .values({ userId, gymId, ...toColumns(input) })
      .returning();
    if (!row) throw new Error("Equipment insert returned no row");
    // The display type's row is the trigger's; the others are written here.
    const extra = alsoTypeIds.filter((id) => id !== row.equipmentTypeId);
    if (extra.length > 0)
      await db
        .insert(equipmentInstanceTypes)
        .values(
          extra.map((equipmentTypeId) => ({
            equipmentInstanceId: row.id,
            equipmentTypeId,
            userId,
          })),
        )
        .onConflictDoNothing();
    await clearAbsences(db, userId, gymId, [row.equipmentTypeId, ...extra]);
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) throw new EquipmentNameTakenError(input.name);
    throw error;
  }
}

export class DisplayTypeError extends Error {
  constructor() {
    super("A machine always keeps the type it was registered as. Change it from Edit instead.");
    this.name = "DisplayTypeError";
  }
}

/**
 * "Also used for": the machine does the work of another type too (a lat pulldown with a low
 * row). Its history is untouched, since history is keyed on the machine, never on a type.
 */
export async function setMachineAlsoUsedFor(
  db: DbOrTx,
  userId: string,
  equipmentId: string,
  equipmentTypeId: string,
  on: boolean,
): Promise<boolean> {
  const [machine] = await db
    .select({
      gymId: equipmentInstances.gymId,
      typeId: equipmentInstances.equipmentTypeId,
      isActive: equipmentInstances.isActive,
    })
    .from(equipmentInstances)
    .where(and(eq(equipmentInstances.id, equipmentId), eq(equipmentInstances.userId, userId)))
    .limit(1);
  if (!machine) return false;
  if (equipmentTypeId === machine.typeId) throw new DisplayTypeError();
  if (on) {
    await db
      .insert(equipmentInstanceTypes)
      .values({ equipmentInstanceId: equipmentId, equipmentTypeId, userId })
      .onConflictDoNothing();
    if (machine.isActive) await clearAbsences(db, userId, machine.gymId, [equipmentTypeId]);
  } else {
    await db
      .delete(equipmentInstanceTypes)
      .where(
        and(
          eq(equipmentInstanceTypes.equipmentInstanceId, equipmentId),
          eq(equipmentInstanceTypes.equipmentTypeId, equipmentTypeId),
          eq(equipmentInstanceTypes.userId, userId),
        ),
      );
  }
  return true;
}

export async function updateEquipment(
  db: DbOrTx,
  userId: string,
  equipmentId: string,
  input: EquipmentInput,
): Promise<typeof equipmentInstances.$inferSelect | null> {
  const current = await getEquipment(db, userId, equipmentId);
  if (!current) return null;
  await assertNameFree(db, current.gymId, input.name, equipmentId);
  try {
    const [row] = await db
      .update(equipmentInstances)
      .set(toColumns(input))
      .where(and(eq(equipmentInstances.id, equipmentId), eq(equipmentInstances.userId, userId)))
      .returning();
    if (row?.isActive) await clearAbsences(db, userId, row.gymId, [row.equipmentTypeId]);
    return row ?? null;
  } catch (error) {
    if (isUniqueViolation(error)) throw new EquipmentNameTakenError(input.name);
    throw error;
  }
}

/**
 * Archives or restores a machine. Set logs that reference it are never touched. A restored
 * machine is here again, so its types stop being absent. An archived one leaves an open
 * workout's exercises that have nothing logged on it, for the workout to settle again; those
 * with sets keep it, as their history does.
 */
export async function setEquipmentActive(
  db: DbOrTx,
  userId: string,
  equipmentId: string,
  isActive: boolean,
): Promise<boolean> {
  const [row] = await db
    .update(equipmentInstances)
    .set({ isActive })
    .where(and(eq(equipmentInstances.id, equipmentId), eq(equipmentInstances.userId, userId)))
    .returning({ id: equipmentInstances.id, gymId: equipmentInstances.gymId });
  if (row && isActive)
    await clearAbsences(db, userId, row.gymId, await machineTypeIds(db, userId, equipmentId));
  if (row && !isActive)
    await db
      .update(workoutExercises)
      .set({ equipmentInstanceId: null })
      .where(
        and(
          eq(workoutExercises.userId, userId),
          eq(workoutExercises.equipmentInstanceId, equipmentId),
          inArray(
            workoutExercises.workoutSessionId,
            db
              .select({ id: workoutSessions.id })
              .from(workoutSessions)
              .where(and(eq(workoutSessions.userId, userId), isNull(workoutSessions.completedAt))),
          ),
          notExists(
            db
              .select({ id: setLogs.id })
              .from(setLogs)
              .where(eq(setLogs.workoutExerciseId, workoutExercises.id)),
          ),
        ),
      );
  return row !== undefined;
}
