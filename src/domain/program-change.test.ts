import { describe, expect, it } from "vitest";

import { parseProgramBlueprint } from "./program-blueprint";
import { assessProgramChange, type ExerciseMuscleReference } from "./program-change";
import { applyProgramPatch, programPatchSchema } from "./program-patch";

const SQUAT = "11111111-1111-4111-8111-111111111111";
const PRESS = "22222222-2222-4222-8222-222222222222";
const library: ExerciseMuscleReference[] = [
  { slug: "high-bar-squat", primaryMuscles: ["quads", "glutes"] },
  { slug: "leg-press", primaryMuscles: ["quads", "glutes"] },
  { slug: "bench-press", primaryMuscles: ["chest"] },
  { slug: "biceps-curl", primaryMuscles: ["biceps"] },
  { slug: "custom-exercise", primaryMuscles: [] },
];
function blueprint() {
  return parseProgramBlueprint({
    blueprintVersion: 1,
    slug: "test-plan",
    name: "Training",
    weeks: 4,
    days: [
      {
        dayIndex: 1,
        dayOfWeek: 1,
        name: "Lower",
        focus: "Legs",
        includesLifting: true,
        includesRun: false,
        warmupSlug: "lower",
        exercises: [
          {
            lineageId: SQUAT,
            exerciseSlug: "high-bar-squat",
            sets: 3,
            reps: [5, 8],
            rir: [1, 2],
            rest: [120, 180],
          },
        ],
      },
      {
        dayIndex: 2,
        dayOfWeek: 3,
        name: "Upper and run",
        focus: "Upper body",
        includesLifting: true,
        includesRun: true,
        warmupSlug: "upper",
        exercises: [
          {
            lineageId: PRESS,
            exerciseSlug: "bench-press",
            sets: 3,
            reps: [5, 8],
            rir: [1, 2],
            rest: [120, 180],
          },
        ],
      },
    ],
    runs: [{ weekIndex: 1, dayOfWeek: 3, duration: [20, 30], rpe: [3, 4] }],
  });
}

describe("weekly prescription authority", () => {
  it("recognizes unchanged data regardless of object keys or explicit day/run array order", () => {
    const before = blueprint();
    const after = { ...before, days: [...before.days].reverse() };
    expect(assessProgramChange(before, after, library).authority).toBe("unchanged");
    expect(after.days[0]?.dayIndex).toBe(2);
  });

  it("permits substantial set, target, rest and run-prescription changes without inventing minor-change thresholds", () => {
    const before = blueprint();
    const after = applyProgramPatch(
      before,
      programPatchSchema.parse({
        operations: [
          {
            op: "adjust",
            lineageId: SQUAT,
            sets: 6,
            reps: [8, 12],
            rir: [2, 4],
            rest: [60, 90],
            reason: "Adjust to the evidence.",
          },
          {
            op: "run",
            weekIndex: 1,
            dayOfWeek: 3,
            duration: [15, 20],
            rpe: [2, 3],
            reason: "Reduce this prescription.",
          },
        ],
      }),
    );
    const assessment = assessProgramChange(before, after, library);
    expect(assessment.authority).toBe("automatic");
    expect(assessment.structuralChanges).toEqual([]);
    expect(assessment.muscleCoverage[0]).toMatchObject({
      planned: { sets: { quads: 3, glutes: 3 } },
      next: { sets: { quads: 6, glutes: 6 } },
      unconfirmedPrimaryMuscles: [],
    });
  });

  it.each([
    ["leg-press", []],
    ["biceps-curl", ["quads", "glutes"]],
    ["custom-exercise", ["quads", "glutes"]],
  ])(
    "allows a substitution to %s and reports coverage rather than blocking autonomy",
    (exerciseSlug, unconfirmed) => {
      const before = blueprint();
      const after = applyProgramPatch(
        before,
        programPatchSchema.parse({
          operations: [
            {
              op: "substitute",
              lineageId: SQUAT,
              exerciseSlug,
              reason: "Best feasible choice at this gym.",
            },
          ],
        }),
      );
      const assessment = assessProgramChange(before, after, library);
      expect(assessment.authority).toBe("automatic");
      expect(assessment.muscleCoverage[0]?.unconfirmedPrimaryMuscles).toEqual(unconfirmed);
      expect(assessment.muscleCoverage[0]?.next.unknownExercises).toEqual(
        exerciseSlug === "custom-exercise" ? [exerciseSlug] : [],
      );
      expect(after.days[0]?.exercises[0]?.lineageId).toBe(SQUAT);
    },
  );

  it("retains muscle coverage at the day level when another exercise covers a substituted target", () => {
    const before = blueprint();
    const after = structuredClone(before);
    after.days[0]!.exercises.push({
      ...after.days[0]!.exercises[0]!,
      lineageId: undefined,
      exerciseSlug: "leg-press",
    });
    after.days[0]!.exercises[0]!.exerciseSlug = "biceps-curl";
    expect(assessProgramChange(before, after, library)).toMatchObject({
      authority: "automatic",
      muscleCoverage: [
        {
          dayIndex: 1,
          retainedPrimaryMuscles: ["quads", "glutes"],
          unconfirmedPrimaryMuscles: [],
          addedPrimaryMuscles: ["biceps"],
        },
        { dayIndex: 2 },
      ],
    });
  });

  it.each(["weekday", "split", "day_count", "run_schedule", "block", "replacement"])(
    "requires review for a %s change despite an automatic label",
    (change) => {
      const before = blueprint();
      const after = structuredClone(before);
      if (change === "weekday") after.days[0]!.dayOfWeek = 2;
      if (change === "split") after.days[0]!.focus = "Full body";
      if (change === "day_count")
        after.days.push({ ...after.days[0]!, dayIndex: 3, dayOfWeek: 5, exercises: [] });
      if (change === "run_schedule") after.runs[0]!.dayOfWeek = 5;
      if (change === "block") after.weeks = 5;
      if (change === "replacement") after.slug = "replacement-plan";
      const assessment = assessProgramChange(before, { ...after, authority: "automatic" }, library);
      expect(assessment.authority).toBe("review_required");
      expect(assessment.structuralChanges.length).toBeGreaterThan(0);
    },
  );

  it("requires review when slot lineage moves between days even if the day labels stay unchanged", () => {
    const before = blueprint();
    const after = structuredClone(before);
    [after.days[0]!.exercises, after.days[1]!.exercises] = [
      after.days[1]!.exercises,
      after.days[0]!.exercises,
    ];
    expect(assessProgramChange(before, after, library).structuralChanges).toContain(
      "slot_moved_between_days",
    );
  });

  it("requires review when an edit removes the entire lifting part of a mixed day", () => {
    const before = blueprint();
    const after = applyProgramPatch(
      before,
      programPatchSchema.parse({
        operations: [{ op: "remove", lineageId: PRESS, reason: "Run only." }],
      }),
    );
    expect(assessProgramChange(before, after, library).authority).toBe("review_required");
  });
});
