import type { ExerciseModality, GymKind } from "./types";

/** Modalities that every real gym is assumed to provide without a registered machine. */
const UBIQUITOUS_MODALITIES: ReadonlySet<ExerciseModality> = new Set([
  "barbell",
  "dumbbell",
  "bodyweight",
  "mobility",
]);

export interface ExerciseRef {
  id: string;
  modality: ExerciseModality;
  requiresEquipment: boolean;
}

export interface EquipmentInstanceRef {
  id: string;
  gymId: string;
  equipmentTypeId: string;
  name: string;
  isActive: boolean;
}

/** Canonical "this exercise can be done on this equipment type" mapping. */
export interface EquipmentOptionRef {
  exerciseId: string;
  equipmentTypeId: string | null;
  equipmentInstanceId: string | null;
  preferenceRank: number;
}

export interface FallbackRef {
  /** null = applies at every gym. */
  gymId: string | null;
  fallbackExercise: ExerciseRef;
  fallbackEquipmentTypeId: string | null;
  fallbackEquipmentInstanceId: string | null;
  rank: number;
}

export interface ResolutionInput {
  exercise: ExerciseRef;
  gym: { id: string; kind: GymKind };
  preferredEquipmentInstanceId: string | null;
  /** Equipment options for the planned exercise and any fallback exercises. */
  options: readonly EquipmentOptionRef[];
  fallbacks: readonly FallbackRef[];
  /** Every equipment instance registered at the gym (inactive ones are ignored). */
  gymEquipment: readonly EquipmentInstanceRef[];
}

export type Resolution =
  | { status: "direct"; exercise: ExerciseRef; equipmentInstance: EquipmentInstanceRef | null }
  | {
      status: "fallback";
      exercise: ExerciseRef;
      equipmentInstance: EquipmentInstanceRef | null;
      fallback: FallbackRef;
    }
  | { status: "unavailable"; exercise: ExerciseRef };

function byName(a: EquipmentInstanceRef, b: EquipmentInstanceRef): number {
  return a.name.localeCompare(b.name);
}

function findInstanceForExercise(
  exercise: ExerciseRef,
  options: readonly EquipmentOptionRef[],
  active: readonly EquipmentInstanceRef[],
): EquipmentInstanceRef | undefined {
  const ranked = options
    .filter((o) => o.exerciseId === exercise.id)
    .sort((a, b) => a.preferenceRank - b.preferenceRank);
  for (const option of ranked) {
    if (option.equipmentInstanceId) {
      const exact = active.find((i) => i.id === option.equipmentInstanceId);
      if (exact) return exact;
    }
    if (option.equipmentTypeId) {
      const ofType = active
        .filter((i) => i.equipmentTypeId === option.equipmentTypeId)
        .sort(byName);
      if (ofType[0]) return ofType[0];
    }
  }
  return undefined;
}

function ubiquitous(exercise: ExerciseRef, gymKind: GymKind): boolean {
  if (!exercise.requiresEquipment) return true;
  return gymKind === "gym" && UBIQUITOUS_MODALITIES.has(exercise.modality);
}

/**
 * Decide what a planned exercise becomes at a specific gym:
 * the planned exercise on its preferred or a compatible machine, a configured fallback,
 * or unavailable. Fallbacks scoped to this gym beat global ones; then lower rank wins.
 */
export function resolveExerciseAtGym(input: ResolutionInput): Resolution {
  const { exercise, gym } = input;
  const active = input.gymEquipment.filter((i) => i.gymId === gym.id && i.isActive);

  if (input.preferredEquipmentInstanceId) {
    const preferred = active.find((i) => i.id === input.preferredEquipmentInstanceId);
    if (preferred) return { status: "direct", exercise, equipmentInstance: preferred };
  }

  const direct = findInstanceForExercise(exercise, input.options, active);
  if (direct) return { status: "direct", exercise, equipmentInstance: direct };
  if (ubiquitous(exercise, gym.kind))
    return { status: "direct", exercise, equipmentInstance: null };

  const fallbacks = input.fallbacks
    .filter((f) => f.gymId === null || f.gymId === gym.id)
    .sort((a, b) => {
      if (a.gymId !== b.gymId) return a.gymId === gym.id ? -1 : 1;
      return a.rank - b.rank;
    });

  for (const fallback of fallbacks) {
    if (fallback.fallbackEquipmentInstanceId) {
      const exact = active.find((i) => i.id === fallback.fallbackEquipmentInstanceId);
      if (exact) {
        return {
          status: "fallback",
          exercise: fallback.fallbackExercise,
          equipmentInstance: exact,
          fallback,
        };
      }
      continue;
    }
    if (fallback.fallbackEquipmentTypeId) {
      const ofType = active
        .filter((i) => i.equipmentTypeId === fallback.fallbackEquipmentTypeId)
        .sort(byName);
      if (ofType[0]) {
        return {
          status: "fallback",
          exercise: fallback.fallbackExercise,
          equipmentInstance: ofType[0],
          fallback,
        };
      }
      continue;
    }
    const viaOptions = findInstanceForExercise(fallback.fallbackExercise, input.options, active);
    if (viaOptions) {
      return {
        status: "fallback",
        exercise: fallback.fallbackExercise,
        equipmentInstance: viaOptions,
        fallback,
      };
    }
    if (ubiquitous(fallback.fallbackExercise, gym.kind)) {
      return {
        status: "fallback",
        exercise: fallback.fallbackExercise,
        equipmentInstance: null,
        fallback,
      };
    }
  }

  return { status: "unavailable", exercise };
}
