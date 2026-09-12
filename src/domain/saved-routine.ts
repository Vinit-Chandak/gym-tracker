import type { BlueprintDay, BlueprintExercise } from "./program-blueprint";
/** A repeated ad hoc exercise may have no prescription; that absence stays explicit. */
export type SavedRoutineDay = Omit<BlueprintDay, "exercises"> & {
  exercises: (BlueprintExercise | { exerciseSlug: string; notes?: string })[];
};
