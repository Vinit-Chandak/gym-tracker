/** Shared form limits; importing them in the browser must not load the plan validator. */
export const PLAN_LIMITS = {
  summary: 400,
  note: 200,
  warmupLines: 8,
  warmupLine: 160,
  exercises: 20,
  sets: 12,
  memo: 2500,
  restSeconds: 1200,
  /** Endurance occurrences one preparation may cover: a busy day, not a whole block. */
  enduranceOccurrences: 8,
} as const;
