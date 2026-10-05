import type { ExerciseListItem } from "@/server/repositories/exercises";

/** A library row for picker tests: a hypertrophy exercise on reps unless told otherwise. */
export function listItem(
  id: string,
  name: string,
  patch: Partial<ExerciseListItem> = {},
): ExerciseListItem {
  return {
    id,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name,
    category: "hypertrophy",
    modality: "machine",
    movementPattern: "push",
    primaryMuscles: ["chest"],
    secondaryMuscles: [],
    loadPortability: "equipment_specific",
    requiresEquipment: true,
    isActive: true,
    defaultPrescriptionType: "reps",
    defaultRepMin: 8,
    defaultRepMax: 12,
    defaultDurationMinSeconds: null,
    defaultDurationMaxSeconds: null,
    defaultDistanceMinMeters: null,
    defaultDistanceMaxMeters: null,
    defaultRir: 2,
    defaultRestSeconds: 90,
    rirNote: null,
    aliases: [],
    isCustom: false,
    ...patch,
  };
}
