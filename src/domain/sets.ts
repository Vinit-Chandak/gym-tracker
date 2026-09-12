import type { LoadUnit, SetType } from "./types";

/** Smallest sensible load jump: the machine's setting, else the exercise default, else 2.5. */
export function weightStepFor(input: {
  equipmentLoadIncrement: number | null;
  exerciseDefaultIncrement: number | null;
}): number {
  return input.equipmentLoadIncrement ?? input.exerciseDefaultIncrement ?? 2.5;
}

/**
 * Bounds the log-set action enforces. Shared with the entry fields so typing stops at the
 * same place the server does, instead of failing only once you try to save.
 */
export const SET_LIMITS = {
  weight: 2000,
  reps: 1000,
  rir: 10,
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

/** "80×10" / "0×12" / "45 s" / "2×20 m" style one-set label. */
export function formatSet(set: SetLike, unitLabel?: string): string {
  const weight = set.weight === null ? "—" : `${set.weight}${unitLabel ? ` ${unitLabel}` : ""}`;
  const times = unitLabel ? " × " : "×";
  if (set.reps === null && set.distanceMeters !== null) {
    return set.weight ? `${weight}${times}${set.distanceMeters} m` : `${set.distanceMeters} m`;
  }
  if (set.durationSeconds !== null && set.reps === null) {
    return set.weight ? `${weight}${times}${set.durationSeconds} s` : `${set.durationSeconds} s`;
  }
  const reps = set.reps === null ? "—" : `${set.reps}`;
  return `${weight}${times}${reps}`;
}

/** Working sets only, joined: "80×10, 80×9, 75×10". */
export function formatSets(
  sets: readonly SetLike[],
  unitLabel?: (unit: LoadUnit) => string,
): string {
  const working = sets.filter((s) => s.setType !== "warmup");
  const shown = working.length > 0 ? working : sets;
  return shown.map((set) => formatSet(set, unitLabel?.(set.unit))).join(", ");
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
