import { and, asc, eq } from "drizzle-orm";

import {
  equipmentInstances,
  equipmentInstanceTypes,
  equipmentTypes,
  gymAbsentEquipmentTypes,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";

import { GymNotFoundError } from "./equipment";
import { getGym } from "./gyms";

export type AbsentEquipmentItem = {
  equipmentTypeId: string;
  typeName: string;
  typeSlug: string;
};

/** Equipment types the user has recorded as not present at a gym. */
export async function listAbsentEquipment(
  db: DbOrTx,
  userId: string,
  gymId: string,
): Promise<AbsentEquipmentItem[]> {
  return db
    .select({
      equipmentTypeId: equipmentTypes.id,
      typeName: equipmentTypes.name,
      typeSlug: equipmentTypes.slug,
    })
    .from(gymAbsentEquipmentTypes)
    .innerJoin(equipmentTypes, eq(equipmentTypes.id, gymAbsentEquipmentTypes.equipmentTypeId))
    .where(
      and(eq(gymAbsentEquipmentTypes.gymId, gymId), eq(gymAbsentEquipmentTypes.userId, userId)),
    )
    .orderBy(asc(equipmentTypes.name));
}

export type AbsenceOutcome =
  | { recorded: true }
  /**
   * An active machine here has the type, so nothing was written: presence and absence are
   * reconciled with the person (ADR 0041), who says whether the machine has gone (archive it,
   * keeping its history) or is only out of use today.
   */
  | { recorded: false; machines: { id: string; name: string }[] };

export async function markEquipmentAbsent(
  db: DbOrTx,
  userId: string,
  gymId: string,
  equipmentTypeId: string,
): Promise<AbsenceOutcome> {
  const gym = await getGym(db, userId, gymId);
  if (!gym) throw new GymNotFoundError();
  const machines = await db
    .select({ id: equipmentInstances.id, name: equipmentInstances.name })
    .from(equipmentInstances)
    .innerJoin(
      equipmentInstanceTypes,
      eq(equipmentInstanceTypes.equipmentInstanceId, equipmentInstances.id),
    )
    .where(
      and(
        eq(equipmentInstances.userId, userId),
        eq(equipmentInstances.gymId, gymId),
        eq(equipmentInstances.isActive, true),
        eq(equipmentInstanceTypes.equipmentTypeId, equipmentTypeId),
      ),
    )
    .orderBy(asc(equipmentInstances.name));
  if (machines.length > 0) return { recorded: false, machines };
  await db
    .insert(gymAbsentEquipmentTypes)
    .values({ userId, gymId, equipmentTypeId })
    .onConflictDoNothing({
      target: [gymAbsentEquipmentTypes.gymId, gymAbsentEquipmentTypes.equipmentTypeId],
    });
  return { recorded: true };
}

export async function unmarkEquipmentAbsent(
  db: DbOrTx,
  userId: string,
  gymId: string,
  equipmentTypeId: string,
): Promise<void> {
  await db
    .delete(gymAbsentEquipmentTypes)
    .where(
      and(
        eq(gymAbsentEquipmentTypes.userId, userId),
        eq(gymAbsentEquipmentTypes.gymId, gymId),
        eq(gymAbsentEquipmentTypes.equipmentTypeId, equipmentTypeId),
      ),
    );
}
