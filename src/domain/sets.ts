import type { LoadUnit, SetType } from "./types";

/** Smallest sensible load jump: the machine's setting, else the exercise default, else 2.5. */
export function weightStepFor(input: {
  equipmentLoadIncrement: number | null;
  exerciseDefaultIncrement: number | null;
}): number {
  return input.equipmentLoadIncrement ?? input.exerciseDefaultIncrement ?? 2.5;
}

export type SetLike = {
  setIndex: number;
  setType: SetType;
  weight: number | null;
  unit: LoadUnit;
  reps: number | null;
  rir: number | null;
  durationSeconds: number | null;
};

/** "80×10" / "0×12" / "45 s" style one-set label. */
export function formatSet(set: SetLike): string {
  if (set.durationSeconds !== null && set.reps === null) {
    return set.weight ? `${set.weight}×${set.durationSeconds} s` : `${set.durationSeconds} s`;
  }
  const weight = set.weight === null ? "—" : `${set.weight}`;
  const reps = set.reps === null ? "—" : `${set.reps}`;
  return `${weight}×${reps}`;
}

/** Working sets only, joined: "80×10, 80×9, 75×10". */
export function formatSets(sets: readonly SetLike[]): string {
  const working = sets.filter((s) => s.setType !== "warmup");
  const shown = working.length > 0 ? working : sets;
  return shown.map(formatSet).join(", ");
}

/** Total load moved by working sets, ignoring bodyweight-only sets. */
export function workingVolume(sets: readonly SetLike[]): number {
  return sets
    .filter((s) => s.setType !== "warmup" && s.weight !== null && s.reps !== null)
    .reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0);
}

/** Adds a step to a numeric string (two-decimal precision); an empty value starts from `from`. */
export function stepValue(current: string, step: number, from: number | null, min = 0): string {
  const parsed = current.trim() === "" ? null : Number(current.replace(",", "."));
  const base = parsed !== null && Number.isFinite(parsed) ? parsed : (from ?? 0);
  const next = Math.max(min, Math.round((base + step) * 100) / 100);
  return String(next);
}
