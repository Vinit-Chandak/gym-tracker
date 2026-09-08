import { describe, expect, it } from "vitest";

import { matchesExerciseQuery } from "./exercise-search";

const latPulldown = {
  name: "Lat pulldown",
  slug: "lat-pulldown",
  category: "hypertrophy",
  modality: "machine",
  movementPattern: "vertical_pull",
  primaryMuscles: ["lats"],
  secondaryMuscles: ["biceps", "upper_back"],
} as const;

describe("exercise search", () => {
  it("matches on name, muscles, modality and movement pattern", () => {
    expect(matchesExerciseQuery(latPulldown, "pull")).toBe(true);
    expect(matchesExerciseQuery(latPulldown, "biceps")).toBe(true);
    expect(matchesExerciseQuery(latPulldown, "machine lats")).toBe(true);
    expect(matchesExerciseQuery(latPulldown, "vertical pull")).toBe(true);
    expect(matchesExerciseQuery(latPulldown, "chest")).toBe(false);
  });

  it("treats an empty query as match-all", () => {
    expect(matchesExerciseQuery(latPulldown, "   ")).toBe(true);
  });
});
