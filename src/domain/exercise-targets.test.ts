import { expect, it } from "vitest";

import { exerciseTargets } from "./exercise-targets";
import type { BlueprintExercise } from "./program-blueprint";

const carry = {
  exerciseSlug: "suitcase-carry",
  sets: 3,
  distance: [15, 30],
  rest: [90, 90],
} as unknown as BlueprintExercise;

it("reads a carry's targets in the athlete's length, and in metres as written (ADR 0056)", () => {
  expect(exerciseTargets(carry, "m")).toMatch(/^3 × 15–30 m · report RPE · rest /);
  // Each end the least whole yard that, logged, reaches it: 16 yd would be kept as 14.6 m.
  expect(exerciseTargets(carry, "yd")).toMatch(/^3 × 17–33 yd · report RPE · rest /);
  // A lift has no length to read in.
  const lift = { ...carry, distance: undefined, reps: [8, 12], rir: [1, 2] } as BlueprintExercise;
  expect(exerciseTargets(lift, "yd")).toBe(exerciseTargets(lift, "m"));
});
