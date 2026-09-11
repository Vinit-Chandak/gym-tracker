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
} as const;
