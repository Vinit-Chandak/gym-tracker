import { and, asc, desc, eq, ne, sql } from "drizzle-orm";

import { isUniqueViolation } from "@/db/errors";
import { equipmentInstances, equipmentTypes, gyms } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { sharedEquipmentTypes } from "@/server/queries/reference";
import type { EquipmentInput } from "@/server/validation/gyms";

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
    })
    .from(equipmentInstances)
    .innerJoin(equipmentTypes, eq(equipmentTypes.id, equipmentInstances.equipmentTypeId))
    .where(and(eq(equipmentInstances.gymId, gymId), eq(equipmentInstances.userId, userId)))
    .orderBy(desc(equipmentInstances.isActive), asc(equipmentInstances.name));
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
    pulleyRatio: input.pulleyRatio,
    angleDegrees: input.angleDegrees,
    notes: input.notes,
  };
}

export async function createEquipment(
  db: DbOrTx,
  userId: string,
  gymId: string,
  input: EquipmentInput,
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
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) throw new EquipmentNameTakenError(input.name);
    throw error;
  }
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
    return row ?? null;
  } catch (error) {
    if (isUniqueViolation(error)) throw new EquipmentNameTakenError(input.name);
    throw error;
  }
}

/** Archives or restores a machine. Set logs that reference it are never touched. */
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
    .returning({ id: equipmentInstances.id });
  return row !== undefined;
}
