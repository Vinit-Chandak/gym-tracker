import { MUSCLE_GROUPS, type MuscleGroup } from "./types";

/**
 * A working set counts fully for each muscle the exercise names as primary, and half for
 * each secondary one. Half is a deliberate compromise: triceps genuinely work on a bench
 * press, but not as hard as the chest, and counting them equally makes every muscle look
 * well trained. Warm-ups never count.
 */
export const SECONDARY_SET_WEIGHT = 0.5;

export type MuscleVolume = Record<MuscleGroup, number>;

export function emptyMuscleVolume(): MuscleVolume {
  return Object.fromEntries(MUSCLE_GROUPS.map((m) => [m, 0])) as MuscleVolume;
}

export type VolumeExercise = {
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
  /** Working sets only; the caller filters warm-ups out. */
  workingSets: number;
};

const isGroup = (value: string): value is MuscleGroup =>
  (MUSCLE_GROUPS as readonly string[]).includes(value);

/** Adds one exercise's working sets into a running per-muscle total. */
export function addExerciseVolume(into: MuscleVolume, exercise: VolumeExercise): MuscleVolume {
  if (exercise.workingSets <= 0) return into;
  // A muscle listed twice on one exercise still counts once, and a muscle listed as both
  // primary and secondary counts at the primary weight.
  const primary = new Set(exercise.primaryMuscles.filter(isGroup));
  for (const muscle of primary) into[muscle] += exercise.workingSets;
  for (const muscle of new Set(exercise.secondaryMuscles.filter(isGroup))) {
    if (!primary.has(muscle)) into[muscle] += exercise.workingSets * SECONDARY_SET_WEIGHT;
  }
  return into;
}

export function muscleVolume(exercises: readonly VolumeExercise[]): MuscleVolume {
  return exercises.reduce(addExerciseVolume, emptyMuscleVolume());
}

/**
 * Weekly set bands. Fixed rather than relative to your own best week, so a light week
 * looks light and the colours mean the same thing every time you open the page.
 */
export const VOLUME_BANDS = [
  { min: 15, label: "15+ sets", step: 4 },
  { min: 10, label: "10–14 sets", step: 3 },
  { min: 5, label: "5–9 sets", step: 2 },
  { min: 0.5, label: "1–4 sets", step: 1 },
  { min: 0, label: "None", step: 0 },
] as const;

export type VolumeStep = 0 | 1 | 2 | 3 | 4;

export function volumeStep(sets: number): VolumeStep {
  return (VOLUME_BANDS.find((band) => sets >= band.min)?.step ?? 0) as VolumeStep;
}
