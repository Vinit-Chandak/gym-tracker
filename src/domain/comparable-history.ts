import type { LoadPortability } from "./types";

/**
 * How previous performance is matched for an exercise.
 * - `exercise`: free weights and bodyweight compare across every gym.
 * - `equipment_instance`: machines and cable stacks only compare on the exact same machine.
 */
export type ComparisonScope = "exercise" | "equipment_instance";

export function comparisonScope(loadPortability: LoadPortability): ComparisonScope {
  return loadPortability === "global" ? "exercise" : "equipment_instance";
}

/** The minimum a performed exercise needs for comparability decisions. */
export interface PerformedExercise {
  exerciseId: string;
  equipmentInstanceId: string | null;
  /** ISO timestamp or Date of the session; newest wins when picking "previous". */
  performedAt: string | Date;
}

export interface ComparisonTarget {
  exerciseId: string;
  loadPortability: LoadPortability;
  /** Equipment about to be used now; required for equipment-specific exercises. */
  equipmentInstanceId: string | null;
}

/**
 * True when `candidate` is a valid "previous comparable" for `target`.
 * A machine set is never compared with a different machine, even at the same gym.
 */
export function isComparable(candidate: PerformedExercise, target: ComparisonTarget): boolean {
  if (candidate.exerciseId !== target.exerciseId) return false;
  if (comparisonScope(target.loadPortability) === "exercise") return true;
  if (target.equipmentInstanceId === null || candidate.equipmentInstanceId === null) return false;
  return candidate.equipmentInstanceId === target.equipmentInstanceId;
}

function timestamp(value: string | Date): number {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

/** All comparable history entries, newest first. */
export function selectComparableHistory<T extends PerformedExercise>(
  history: readonly T[],
  target: ComparisonTarget,
): T[] {
  return history
    .filter((entry) => isComparable(entry, target))
    .sort((a, b) => timestamp(b.performedAt) - timestamp(a.performedAt));
}

/** The single most recent comparable entry, if any. */
export function previousComparable<T extends PerformedExercise>(
  history: readonly T[],
  target: ComparisonTarget,
): T | undefined {
  return selectComparableHistory(history, target)[0];
}
