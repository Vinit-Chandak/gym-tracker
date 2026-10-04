import { sql } from "drizzle-orm";

import { equipmentInstances } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { ModalityTypeIds, RequirementRef } from "@/domain/equipment-resolution";
import type { EquipmentCategory, GymKind } from "@/domain/types";
import {
  assumedTypeIds,
  freeTypeIds,
  sharedEquipmentTypes,
  sharedRequirements,
} from "@/server/queries/reference";

/**
 * Every type a machine is, read with the machine: a lat pulldown with a low row is both
 * (ADR 0041). A machine's display type is always among them.
 */
export const instanceTypeIds = sql<string[]>`coalesce(
  (select array_agg(t.equipment_type_id) from equipment_instance_types t
   where t.equipment_instance_id = ${equipmentInstances.id}),
  array[${equipmentInstances.equipmentTypeId}]
)`;

/**
 * What the resolver reads besides a location's own rows: every exercise's requirement groups,
 * the types each kind of location assumes, the floor, and the types a free-weight modality needs.
 * All of it is shared reference data, served from memory.
 */
export type ReferenceSets = {
  requirements: RequirementRef[];
  free: Set<string>;
  assumed: Record<GymKind, Set<string>>;
  modalityTypeIds: ModalityTypeIds;
  /** Each type's category: machines and cables are confirmed on first use, free weights never. */
  categoryById: Map<string, EquipmentCategory>;
};

export async function referenceSets(db: DbOrTx): Promise<ReferenceSets> {
  const [requirements, free, gym, home, outdoor, types] = await Promise.all([
    sharedRequirements(db),
    freeTypeIds(db),
    assumedTypeIds(db, "gym"),
    assumedTypeIds(db, "home"),
    assumedTypeIds(db, "outdoor"),
    sharedEquipmentTypes(db),
  ]);
  const bySlug = (slug: string) => types.find((type) => type.slug === slug)?.id;
  return {
    requirements,
    free,
    assumed: { gym, home, outdoor },
    modalityTypeIds: { barbell: bySlug("barbell"), dumbbell: bySlug("dumbbells") },
    categoryById: new Map(types.map((type) => [type.id, type.category])),
  };
}

/** The resolver's location-independent inputs, from the reference sets, for one kind of place. */
export function referenceInputs(refs: ReferenceSets, kind: GymKind) {
  return {
    requirements: refs.requirements,
    assumedEquipmentTypeIds: refs.assumed[kind],
    freeEquipmentTypeIds: refs.free,
    modalityTypeIds: refs.modalityTypeIds,
  };
}
