import type { ExerciseCategory, ExerciseModality, MuscleGroup } from "@/domain/types";

import { EXERCISE_CATEGORY_LABELS, EXERCISE_MODALITY_LABELS, MUSCLE_LABELS } from "./labels";

export type SearchableExercise = {
  name: string;
  slug: string;
  category: ExerciseCategory;
  modality: ExerciseModality;
  movementPattern: string;
  primaryMuscles: readonly MuscleGroup[];
  secondaryMuscles: readonly MuscleGroup[];
};

function haystack(exercise: SearchableExercise): string {
  return [
    exercise.name,
    exercise.slug.replace(/-/g, " "),
    EXERCISE_CATEGORY_LABELS[exercise.category],
    EXERCISE_MODALITY_LABELS[exercise.modality],
    exercise.movementPattern.replace(/_/g, " "),
    ...exercise.primaryMuscles.map((m) => MUSCLE_LABELS[m]),
    ...exercise.secondaryMuscles.map((m) => MUSCLE_LABELS[m]),
  ]
    .join(" ")
    .toLowerCase();
}

/** Every whitespace-separated word of the query must appear in the exercise's text. */
export function matchesExerciseQuery(exercise: SearchableExercise, query: string): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const text = haystack(exercise);
  return tokens.every((token) => text.includes(token));
}
