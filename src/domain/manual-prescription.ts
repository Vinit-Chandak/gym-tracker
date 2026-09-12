import { prescriptionTypeOf, type BlueprintExercise } from "./program-blueprint";
export function manualPrescription(entry: BlueprintExercise) {
  return {
    sets: entry.sets,
    prescriptionType: prescriptionTypeOf(entry),
    repMin: entry.reps?.[0] ?? null,
    repMax: entry.reps?.[1] ?? null,
    durationMinSeconds: entry.duration?.[0] ?? null,
    durationMaxSeconds: entry.duration?.[1] ?? null,
    distanceMinMeters: entry.distance?.[0] ?? null,
    distanceMaxMeters: entry.distance?.[1] ?? null,
    perSide: entry.perSide ?? false,
    rirMin: entry.rir?.[0] ?? null,
    rirMax: entry.rir?.[1] ?? null,
    restMinSeconds: entry.rest[0],
    restMaxSeconds: entry.rest[1],
    targetLoadNote: entry.targetLoadNote ?? null,
    progressionNotes: entry.progressionNotes ?? null,
    keyCue: entry.keyCue ?? null,
    loadIncrement: null,
    progressionRule: entry.progressionRule ?? null,
  };
}
