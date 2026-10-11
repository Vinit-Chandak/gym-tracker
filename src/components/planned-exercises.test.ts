import { expect, it } from "vitest";

import type { PlannedExercisePreview } from "@/server/repositories/schedule";

import { planSummary } from "./planned-exercises";

const exercise = (sets: number) => ({ sets }) as PlannedExercisePreview;

it("holds each count to its noun and the dot to the count after it", () => {
  // A narrow line breaks only before the dot: never "4 exercises · 13 / sets".
  expect(planSummary([exercise(4), exercise(3), exercise(3), exercise(3)])).toBe(
    "4\u00a0exercises ·\u00a013\u00a0sets",
  );
  expect(planSummary([exercise(1)])).toBe("1\u00a0exercise ·\u00a01\u00a0set");
});
