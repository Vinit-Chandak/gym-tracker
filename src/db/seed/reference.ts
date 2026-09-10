import { and, inArray, isNull, sql } from "drizzle-orm";

import { equipmentTypes, exerciseEquipmentOptions, exercises, warmupProtocols } from "../schema";
import type { DbOrTx } from "../types";
import { EQUIPMENT_TYPES } from "./data/equipment-types";
import { EXERCISES } from "./data/exercises";
import { WARMUP_PROTOCOLS } from "./data/warmups";

export type ReferenceSeedSummary = {
  equipmentTypes: number;
  exercises: number;
  equipmentOptions: number;
  warmupProtocols: number;
};

/**
 * Upserts the shared reference data by slug. Safe to run repeatedly; it never touches
 * user-owned rows. Runs as the migration role (bypasses RLS).
 */
export async function seedReferenceData(db: DbOrTx): Promise<ReferenceSeedSummary> {
  await db
    .insert(equipmentTypes)
    .values(
      EQUIPMENT_TYPES.map((t) => ({
        slug: t.slug,
        name: t.name,
        category: t.category,
        defaultResistanceMode: t.defaultResistanceMode,
        defaultUnit: t.defaultUnit,
        sortOrder: t.sortOrder,
      })),
    )
    .onConflictDoUpdate({
      target: equipmentTypes.slug,
      set: {
        name: sql`excluded.name`,
        category: sql`excluded.category`,
        defaultResistanceMode: sql`excluded.default_resistance_mode`,
        defaultUnit: sql`excluded.default_unit`,
        sortOrder: sql`excluded.sort_order`,
      },
    });

  await db
    .insert(warmupProtocols)
    .values(
      WARMUP_PROTOCOLS.map((p) => ({
        slug: p.slug,
        name: p.name,
        description: p.description,
        drills: p.drills,
      })),
    )
    .onConflictDoUpdate({
      target: warmupProtocols.slug,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        drills: sql`excluded.drills`,
      },
    });

  await db
    .insert(exercises)
    .values(
      EXERCISES.map((e) => ({
        slug: e.slug,
        name: e.name,
        category: e.category,
        modality: e.modality,
        movementPattern: e.movementPattern,
        primaryMuscles: e.primaryMuscles,
        secondaryMuscles: e.secondaryMuscles ?? [],
        loadPortability: e.loadPortability,
        requiresEquipment: e.requiresEquipment ?? true,
        defaultPrescriptionType: e.measure ?? "reps",
        defaultRepMin: e.defaultRepMin ?? null,
        defaultRepMax: e.defaultRepMax ?? null,
        defaultDurationMinSeconds: e.defaultDurationMin ?? null,
        defaultDurationMaxSeconds: e.defaultDurationMax ?? null,
        defaultDistanceMinMeters: e.defaultDistanceMin ?? null,
        defaultDistanceMaxMeters: e.defaultDistanceMax ?? null,
        defaultRir: e.defaultRir ?? null,
        rirNote: e.rirNote ?? null,
        defaultRestSeconds: e.defaultRestSeconds ?? null,
        defaultLoadIncrement: e.defaultLoadIncrement ?? null,
        formNotes: e.formNotes ?? null,
        formUrl: e.formUrl ?? null,
        isActive: e.isActive ?? true,
      })),
    )
    .onConflictDoUpdate({
      target: exercises.slug,
      set: {
        name: sql`excluded.name`,
        category: sql`excluded.category`,
        modality: sql`excluded.modality`,
        movementPattern: sql`excluded.movement_pattern`,
        primaryMuscles: sql`excluded.primary_muscles`,
        secondaryMuscles: sql`excluded.secondary_muscles`,
        loadPortability: sql`excluded.load_portability`,
        requiresEquipment: sql`excluded.requires_equipment`,
        defaultPrescriptionType: sql`excluded.default_prescription_type`,
        defaultRepMin: sql`excluded.default_rep_min`,
        defaultRepMax: sql`excluded.default_rep_max`,
        defaultDurationMinSeconds: sql`excluded.default_duration_min_seconds`,
        defaultDurationMaxSeconds: sql`excluded.default_duration_max_seconds`,
        defaultDistanceMinMeters: sql`excluded.default_distance_min_meters`,
        defaultDistanceMaxMeters: sql`excluded.default_distance_max_meters`,
        defaultRir: sql`excluded.default_rir`,
        rirNote: sql`excluded.rir_note`,
        defaultRestSeconds: sql`excluded.default_rest_seconds`,
        defaultLoadIncrement: sql`excluded.default_load_increment`,
        formNotes: sql`excluded.form_notes`,
        formUrl: sql`excluded.form_url`,
        isActive: sql`excluded.is_active`,
        updatedAt: sql`now()`,
      },
    });

  const typeRows = await db
    .select({ id: equipmentTypes.id, slug: equipmentTypes.slug })
    .from(equipmentTypes);
  const typeIdBySlug = new Map(typeRows.map((r) => [r.slug, r.id]));

  const exerciseRows = await db
    .select({ id: exercises.id, slug: exercises.slug })
    .from(exercises)
    .where(
      inArray(
        exercises.slug,
        EXERCISES.map((e) => e.slug),
      ),
    );
  const exerciseIdBySlug = new Map(exerciseRows.map((r) => [r.slug, r.id]));

  // Canonical options are rebuilt from the seed so removed mappings disappear too.
  await db
    .delete(exerciseEquipmentOptions)
    .where(
      and(
        isNull(exerciseEquipmentOptions.userId),
        inArray(exerciseEquipmentOptions.exerciseId, [...exerciseIdBySlug.values()]),
      ),
    );

  const optionRows = EXERCISES.flatMap((e) =>
    e.equipment.map((typeSlug, index) => {
      const exerciseId = exerciseIdBySlug.get(e.slug);
      const equipmentTypeId = typeIdBySlug.get(typeSlug);
      if (!exerciseId || !equipmentTypeId) {
        throw new Error(`Unknown equipment type "${typeSlug}" on exercise "${e.slug}"`);
      }
      return { exerciseId, equipmentTypeId, preferenceRank: index + 1 };
    }),
  );
  await db.insert(exerciseEquipmentOptions).values(optionRows);

  return {
    equipmentTypes: EQUIPMENT_TYPES.length,
    exercises: EXERCISES.length,
    equipmentOptions: optionRows.length,
    warmupProtocols: WARMUP_PROTOCOLS.length,
  };
}
