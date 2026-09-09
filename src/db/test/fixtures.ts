import { and, desc, eq } from "drizzle-orm";

import {
  equipmentInstances,
  equipmentTypes,
  gymAbsentEquipmentTypes,
  gyms,
  profiles,
  programs,
} from "@/db/schema";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "@/db/seed/data/program";
import type { DbOrTx } from "@/db/types";
import type { GymKind, LoadUnit, ResistanceMode } from "@/domain/types";
import { createProgramFromBlueprint } from "@/server/repositories/programs";

/**
 * A populated account for tests: several gyms, one of them well equipped, and a copy of the
 * built-in programme template. The app itself seeds none of this — a real account builds it
 * through onboarding — so it lives here, where it can stay stable while the app changes.
 */
export const FIXTURE_START_DATE = "2026-09-08";

type FixtureGym = { slug: string; name: string; kind: GymKind; isDefault?: boolean };

export const FIXTURE_GYMS: readonly FixtureGym[] = [
  { slug: "anytime-fitness", name: "Anytime Fitness", kind: "gym", isDefault: true },
  { slug: "samsung-gym", name: "Samsung Gym", kind: "gym" },
  { slug: "society-gym", name: "Society Gym", kind: "gym" },
  { slug: "outdoor", name: "Outdoor", kind: "outdoor" },
  { slug: "home", name: "Home", kind: "home" },
];

type FixtureMachine = {
  name: string;
  equipmentTypeSlug: string;
  resistanceMode: ResistanceMode;
  unit?: LoadUnit;
  loadIncrement?: number;
};

/** The machines registered at the well-equipped gym. */
export const FIXTURE_EQUIPMENT: readonly FixtureMachine[] = [
  {
    name: "Smith machine",
    equipmentTypeSlug: "smith_machine",
    resistanceMode: "plate_loaded",
    loadIncrement: 2.5,
  },
  { name: "Cable station", equipmentTypeSlug: "cable_station", resistanceMode: "selectorized" },
  {
    name: "Assisted pull-up machine",
    equipmentTypeSlug: "assisted_pullup",
    resistanceMode: "selectorized",
  },
  { name: "Seated leg curl", equipmentTypeSlug: "leg_curl_seated", resistanceMode: "selectorized" },
  { name: "Pec deck", equipmentTypeSlug: "pec_deck", resistanceMode: "selectorized" },
  { name: "45° leg press", equipmentTypeSlug: "leg_press_45", resistanceMode: "plate_loaded" },
  {
    name: "Horizontal leg press",
    equipmentTypeSlug: "leg_press_horizontal",
    resistanceMode: "plate_loaded",
  },
];

/** Equipment the well-equipped gym is known not to have, so exercises can resolve as absent. */
export const FIXTURE_ABSENT_EQUIPMENT: readonly string[] = [
  "hip_thrust_machine",
  "calf_raise_machine",
];

export type FixtureResult = {
  gymIdBySlug: Map<string, string>;
  programId: string;
  /** False when the account was already populated, so callers can seed twice safely. */
  created: boolean;
};

export async function seedTestUserData(
  db: DbOrTx,
  user: { id: string; email?: string | null },
  options: { startDate?: string } = {},
): Promise<FixtureResult> {
  await db
    .insert(profiles)
    .values({ id: user.id, email: user.email ?? null })
    .onConflictDoNothing({ target: profiles.id });

  await db
    .insert(gyms)
    .values(
      FIXTURE_GYMS.map((gym) => ({
        userId: user.id,
        name: gym.name,
        slug: gym.slug,
        kind: gym.kind,
        isDefault: gym.isDefault === true,
      })),
    )
    .onConflictDoNothing({ target: [gyms.userId, gyms.slug] });
  const gymRows = await db
    .select({ id: gyms.id, slug: gyms.slug })
    .from(gyms)
    .where(eq(gyms.userId, user.id));
  const gymIdBySlug = new Map(gymRows.map((gym) => [gym.slug, gym.id]));
  const equippedGymId = gymIdBySlug.get("anytime-fitness");
  if (!equippedGymId) throw new Error("Fixture gym missing");

  const typeRows = await db
    .select({ id: equipmentTypes.id, slug: equipmentTypes.slug })
    .from(equipmentTypes);
  const typeIdBySlug = new Map(typeRows.map((type) => [type.slug, type.id]));
  const typeId = (slug: string): string => {
    const id = typeIdBySlug.get(slug);
    if (!id) throw new Error(`Fixture needs equipment type "${slug}"; seed reference data first.`);
    return id;
  };

  await db
    .insert(equipmentInstances)
    .values(
      FIXTURE_EQUIPMENT.map((machine) => ({
        userId: user.id,
        gymId: equippedGymId,
        equipmentTypeId: typeId(machine.equipmentTypeSlug),
        name: machine.name,
        resistanceMode: machine.resistanceMode,
        unit: machine.unit ?? ("kg" as const),
        loadIncrement: machine.loadIncrement ?? null,
      })),
    )
    .onConflictDoNothing({ target: [equipmentInstances.gymId, equipmentInstances.name] });
  await db
    .insert(gymAbsentEquipmentTypes)
    .values(
      FIXTURE_ABSENT_EQUIPMENT.map((slug) => ({
        userId: user.id,
        gymId: equippedGymId,
        equipmentTypeId: typeId(slug),
      })),
    )
    .onConflictDoNothing({
      target: [gymAbsentEquipmentTypes.gymId, gymAbsentEquipmentTypes.equipmentTypeId],
    });

  const [existing] = await db
    .select({ id: programs.id })
    .from(programs)
    .where(and(eq(programs.userId, user.id), eq(programs.status, "active")))
    .orderBy(desc(programs.version))
    .limit(1);
  if (existing) return { gymIdBySlug, programId: existing.id, created: false };

  const program = await createProgramFromBlueprint(db, user.id, STRENGTH_AESTHETICS_HYBRID_8WK, {
    startDate: options.startDate ?? FIXTURE_START_DATE,
  });
  return { gymIdBySlug, programId: program.id, created: true };
}
