import { and, asc, eq } from "drizzle-orm";

import { equipmentTypes, gymAbsentEquipmentTypes } from "@/db/schema";
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

export async function markEquipmentAbsent(
  db: DbOrTx,
  userId: string,
  gymId: string,
  equipmentTypeId: string,
): Promise<void> {
  const gym = await getGym(db, userId, gymId);
  if (!gym) throw new GymNotFoundError();
  await db
    .insert(gymAbsentEquipmentTypes)
    .values({ userId, gymId, equipmentTypeId })
    .onConflictDoNothing({
      target: [gymAbsentEquipmentTypes.gymId, gymAbsentEquipmentTypes.equipmentTypeId],
    });
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
