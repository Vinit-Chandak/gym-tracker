import type { LoadUnit, SetType } from "./types";
import { loadStepIn } from "@/lib/units";

/**
 * Smallest sensible load jump: the machine's setting, else the exercise default, else 2.5.
 *
 * The machine's setting is typed in the machine's own unit. The default is the library's, in
 * kilograms, so where the load is read in pounds it is the plate jump nearest it: onboarding
 * registers a pound lifter's barbell and dumbbells without an increment, and 2.5 read as pounds
 * asked for a 137.5 lb bar.
 */
export function weightStepFor(input: {
  equipmentLoadIncrement: number | null;
  exerciseDefaultIncrement: number | null;
  /** The unit the step is used in; a machine's own scale takes the default as it is. */
  unit?: string;
}): number {
  if (input.equipmentLoadIncrement !== null) return input.equipmentLoadIncrement;
  const step = input.exerciseDefaultIncrement ?? 2.5;
  return input.unit === "lb" ? loadStepIn(step, "lb") : step;
}

/**
 * Bounds the log-set action enforces. Shared with the entry fields so typing stops at the
 * same place the server does, instead of failing only once you try to save.
 */
export const SET_LIMITS = {
  weight: 2000,
  reps: 1000,
  rir: 10,
  rpe: 10,
  durationSeconds: 36_000,
  /** Metres. Carries and sled work; 100 km is far past anything logged as a set. */
  distanceMeters: 100_000,
} as const;

export type SetLike = {
  setIndex: number;
  setType: SetType;
  weight: number | null;
  unit: LoadUnit;
  reps: number | null;
  rir: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

/** What a set actually counted, read from the set rather than from the plan that asked for it. */
export function measureOf(set: Pick<SetLike, "reps" | "durationSeconds" | "distanceMeters">) {
  if (set.reps !== null) return "reps" as const;
  if (set.distanceMeters !== null) return "distance" as const;
  if (set.durationSeconds !== null) return "duration" as const;
  return "reps" as const;
}

/**
 * What an exercise's logged load is: a weight lifted; on a bodyweight movement, what was added
 * to the body (the logger's "kg added"); on an assisted machine, the help it gave (ADR 0048).
 */
export type LoadReading = "load" | "bodyweight" | "assisted";

export function loadReadingOf(
  exercise: { modality: string },
  assisted: boolean | undefined,
): LoadReading {
  if (assisted) return "assisted";
  return exercise.modality === "bodyweight" ? "bodyweight" : "load";
}

/** A set's load in words: "80 kg", "Bodyweight" for nothing added, "50 kg assistance". */
function loadWords(set: SetLike, unitLabel: string | undefined, reading: LoadReading): string {
  // Nothing added to the body, or a machine giving no help, is the body alone, never "0 kg".
  if ((reading === "bodyweight" && !set.weight) || (reading === "assisted" && set.weight === 0))
    return "Bodyweight";
  if (set.weight === null) return "—";
  const load = `${set.weight}${unitLabel ? `\u00a0${unitLabel}` : ""}`;
  return reading === "assisted" ? `${load}\u00a0assistance` : load;
}

/**
 * "80×10" / "0×12" / "45 s" / "2×20 m" style one-set label; with a unit, "80 kg × 10", and read
 * as `reading` says: "Bodyweight × 12", "50 kg assistance × 6". A set is one fact, its spaces
 * unbreakable: a list of them wraps between sets, never inside one.
 */
export function formatSet(set: SetLike, unitLabel?: string, reading: LoadReading = "load"): string {
  const weight = loadWords(set, unitLabel, reading);
  const times = unitLabel ? "\u00a0×\u00a0" : "×";
  if (set.reps === null && set.distanceMeters !== null) {
    return set.weight
      ? `${weight}${times}${set.distanceMeters}\u00a0m`
      : `${set.distanceMeters}\u00a0m`;
  }
  if (set.durationSeconds !== null && set.reps === null) {
    return set.weight
      ? `${weight}${times}${set.durationSeconds}\u00a0s`
      : `${set.durationSeconds}\u00a0s`;
  }
  const reps = set.reps === null ? "—" : `${set.reps}`;
  return `${weight}${times}${reps}`;
}

/** Working sets only, joined: "80×10, 80×9, 75×10". */
export function formatSets(
  sets: readonly SetLike[],
  unitLabel?: (unit: LoadUnit) => string,
  reading: LoadReading = "load",
): string {
  const working = sets.filter((s) => s.setType !== "warmup");
  const shown = working.length > 0 ? working : sets;
  return shown.map((set) => formatSet(set, unitLabel?.(set.unit), reading)).join(", ");
}

/**
 * How many sets a workout counts: every set but a warm-up, as its sets are listed (`formatSets`),
 * its volume is totalled and a friend reads it (ADR 0026). A warm-up is done, drawn grey in the
 * print, and counted nowhere.
 */
export function workingSetCount(sets: readonly Pick<SetLike, "setType">[]): number {
  return sets.filter((s) => s.setType !== "warmup").length;
}

/** Total load moved by working sets, ignoring bodyweight-only sets. */
export function workingVolume(sets: readonly SetLike[]): number {
  return sets
    .filter((s) => s.setType !== "warmup" && s.weight !== null && s.reps !== null)
    .reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0);
}

/**
 * Keeps typed entry to a number the server will accept: digits, at most one decimal point,
 * no sign, never above `max`. A trailing "." survives so a decimal can still be typed one
 * key at a time. Without this, "abc" or "-20" reach the action and come back as a failed save.
 */
export function sanitizeNumberEntry(
  raw: string,
  inputMode: "decimal" | "numeric" = "decimal",
  max?: number,
): string {
  const cleaned = raw.replace(",", ".").replace(inputMode === "numeric" ? /[^\d]/g : /[^\d.]/g, "");
  const [head, ...rest] = cleaned.split(".");
  const value = rest.length > 0 ? `${head}.${rest.join("")}` : cleaned;
  if (max === undefined || value === "") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > max ? String(max) : value;
}

/** Adds a step to a numeric string (two-decimal precision); an empty value starts from `from`. */
export function stepValue(current: string, step: number, from: number | null, min = 0): string {
  const parsed = current.trim() === "" ? null : Number(current.replace(",", "."));
  const base = parsed !== null && Number.isFinite(parsed) ? parsed : (from ?? 0);
  const next = Math.max(min, Math.round((base + step) * 100) / 100);
  return String(next);
}
