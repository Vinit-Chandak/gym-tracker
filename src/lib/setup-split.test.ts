import { describe, expect, it } from "vitest";

import { programBlueprintSchema } from "@/domain/program-blueprint";

import {
  splitExercise,
  splitName,
  splitPrescription,
  splitProblem,
  splitToBlueprint,
  type ExerciseDefaults,
  type SplitDay,
} from "./setup-split";

const library = (patch: Partial<ExerciseDefaults> & { slug: string; name: string }) =>
  ({
    defaultPrescriptionType: "reps",
    defaultRepMin: null,
    defaultRepMax: null,
    defaultDurationMinSeconds: null,
    defaultDurationMaxSeconds: null,
    defaultDistanceMinMeters: null,
    defaultDistanceMaxMeters: null,
    defaultRir: null,
    defaultRestSeconds: null,
    ...patch,
  }) as ExerciseDefaults;

const bench = splitExercise(
  library({
    slug: "barbell-bench-press",
    name: "Barbell bench press",
    defaultRepMin: 5,
    defaultRepMax: 8,
    defaultRir: 2,
    defaultRestSeconds: 180,
  }),
);
const plank = splitExercise(
  library({
    slug: "plank",
    name: "Plank",
    defaultPrescriptionType: "duration",
    defaultDurationMinSeconds: 30,
    defaultDurationMaxSeconds: 60,
  }),
);

describe("a split, as someone who already trains sets it down", () => {
  it("starts an exercise at three sets of its usual target, in the app's notation", () => {
    expect(splitPrescription(bench)).toBe("3 × 5–8 @ 2–3 RIR");
    expect(splitPrescription(plank)).toBe("3 × 30–60 s");
    // With nothing in the library to go on: 8 to 12, a rep or two in reserve.
    expect(splitPrescription(splitExercise(library({ slug: "curl", name: "Curl" })))).toBe(
      "3 × 8–12 @ 1–2 RIR",
    );
  });

  it("says reps in reserve in whole reps", () => {
    const fly = splitExercise(library({ slug: "fly", name: "Fly", defaultRir: 1.5 }));
    expect(fly.rir).toEqual([1, 2]);
  });

  it("is named after its training days", () => {
    const days: SplitDay[] = [
      { name: "Push", exercises: [bench] },
      { name: "Pull", exercises: [bench] },
      { name: "Rest", exercises: [] },
    ];
    expect(splitName(days)).toBe("Push / Pull");
    expect(splitName([{ name: "", exercises: [] }])).toBe("My split");
  });

  it("needs a day with something on it, and no day over the limit", () => {
    expect(splitProblem([{ name: "Day 1", exercises: [] }])).toMatch(/at least one day/);
    expect(splitProblem([{ name: "Push", exercises: Array(21).fill(bench) }])).toMatch(/Day 1/);
    expect(splitProblem([{ name: "Push", exercises: [bench] }])).toBeNull();
  });

  it("becomes a programme the app accepts, repeating from the day it starts", () => {
    const blueprint = splitToBlueprint(
      [
        { name: "Push", exercises: [bench, plank] },
        { name: "", exercises: [bench] },
        { name: "", exercises: [] },
      ],
      // A Saturday: the days fall on Saturday, Sunday and Monday.
      "2026-10-10",
      "ab12CD34",
    );
    expect(() => programBlueprintSchema.parse(blueprint)).not.toThrow();
    expect(blueprint.slug).toBe("split-ab12cd34");
    expect(blueprint.days.map((day) => [day.name, day.dayOfWeek, day.includesLifting])).toEqual([
      ["Push", 6, true],
      ["Day 2", 7, true],
      ["Rest", 1, false],
    ]);
    expect(blueprint.days[0]!.exercises[1]).toMatchObject({ duration: [30, 60], rir: null });
    expect(blueprint.days[0]!.exercises[0]).toMatchObject({
      exerciseSlug: "barbell-bench-press",
      sets: 3,
      reps: [5, 8],
      rir: [2, 3],
      rest: [180, 210],
    });
  });
});
