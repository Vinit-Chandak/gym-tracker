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

/** "This exercise can be done on this equipment type" (shared) or "on this machine" (user's). */
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
  /** Equipment types the user has marked as not present at this gym. */
  absentEquipmentTypeIds?: ReadonlySet<string>;
}

export type AvailabilityStatus = "direct" | "fallback" | "unknown" | "unavailable";

export type Resolution =
  | { status: "direct"; exercise: ExerciseRef; equipmentInstance: EquipmentInstanceRef | null }
  | {
      status: "fallback";
      exercise: ExerciseRef;
      equipmentInstance: EquipmentInstanceRef | null;
      fallback: FallbackRef;
    }
  | {
      /** Nothing registered matches, and the gym has not been marked as lacking it. */
      status: "unknown";
      exercise: ExerciseRef;
      /** Equipment types that would make the exercise (or a fallback) available. */
      missingEquipmentTypeIds: string[];
    }
  | { status: "unavailable"; exercise: ExerciseRef };

function byName(a: EquipmentInstanceRef, b: EquipmentInstanceRef): number {
  return a.name.localeCompare(b.name);
}

function rankedOptions(exerciseId: string, options: readonly EquipmentOptionRef[]) {
  return options
    .filter((o) => o.exerciseId === exerciseId)
    .sort((a, b) => a.preferenceRank - b.preferenceRank);
}

function findInstanceForExercise(
  exercise: ExerciseRef,
  options: readonly EquipmentOptionRef[],
  active: readonly EquipmentInstanceRef[],
): EquipmentInstanceRef | undefined {
  for (const option of rankedOptions(exercise.id, options)) {
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

/** Equipment types that would satisfy the exercise and are not known to be absent. */
function openTypeIds(
  exercise: ExerciseRef,
  options: readonly EquipmentOptionRef[],
  absent: ReadonlySet<string>,
): string[] {
  const ids = rankedOptions(exercise.id, options)
    .map((o) => o.equipmentTypeId)
    .filter((id): id is string => id !== null && !absent.has(id));
  return [...new Set(ids)];
}

/**
 * Decide what a planned exercise becomes at a specific gym:
 * - `direct`: the planned exercise, on its preferred or a compatible registered machine, or a
 *   free-weight/bodyweight movement at a real gym;
 * - `fallback`: a configured alternative that resolves (gym-specific fallbacks win, then rank);
 * - `unknown`: a machine would be needed, but the gym's inventory does not say it is missing;
 * - `unavailable`: every way of doing it needs equipment the gym is known not to have, or the
 *   location is not a gym.
 */
export function resolveExerciseAtGym(input: ResolutionInput): Resolution {
  const { exercise, gym } = input;
  const absent = input.absentEquipmentTypeIds ?? new Set<string>();
  const active = input.gymEquipment.filter((i) => i.gymId === gym.id && i.isActive);

  if (input.preferredEquipmentInstanceId) {
    const preferred = active.find((i) => i.id === input.preferredEquipmentInstanceId);
    if (preferred) return { status: "direct", exercise, equipmentInstance: preferred };
  }

  const direct = findInstanceForExercise(exercise, input.options, active);
  if (direct) return { status: "direct", exercise, equipmentInstance: direct };
  if (ubiquitous(exercise, gym.kind))
    return { status: "direct", exercise, equipmentInstance: null };

  const missing = new Set<string>(openTypeIds(exercise, input.options, absent));

  const fallbacks = input.fallbacks
    .filter((f) => f.gymId === null || f.gymId === gym.id)
    .sort((a, b) => {
      if (a.gymId !== b.gymId) return a.gymId === gym.id ? -1 : 1;
      return a.rank - b.rank;
    });

  for (const fallback of fallbacks) {
    const alt = fallback.fallbackExercise;
    if (fallback.fallbackEquipmentInstanceId) {
      const exact = active.find((i) => i.id === fallback.fallbackEquipmentInstanceId);
      if (exact) return { status: "fallback", exercise: alt, equipmentInstance: exact, fallback };
      continue;
    }
    if (fallback.fallbackEquipmentTypeId) {
      const ofType = active
        .filter((i) => i.equipmentTypeId === fallback.fallbackEquipmentTypeId)
        .sort(byName);
      if (ofType[0]) {
        return { status: "fallback", exercise: alt, equipmentInstance: ofType[0], fallback };
      }
      if (!absent.has(fallback.fallbackEquipmentTypeId))
        missing.add(fallback.fallbackEquipmentTypeId);
      continue;
    }
    const viaOptions = findInstanceForExercise(alt, input.options, active);
    if (viaOptions) {
      return { status: "fallback", exercise: alt, equipmentInstance: viaOptions, fallback };
    }
    if (ubiquitous(alt, gym.kind)) {
      return { status: "fallback", exercise: alt, equipmentInstance: null, fallback };
    }
    for (const id of openTypeIds(alt, input.options, absent)) missing.add(id);
  }

  if (gym.kind === "gym" && missing.size > 0) {
    return { status: "unknown", exercise, missingEquipmentTypeIds: [...missing] };
  }
  return { status: "unavailable", exercise };
}
