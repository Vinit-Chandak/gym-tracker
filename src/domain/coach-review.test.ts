import { describe, expect, it } from "vitest";

import { reviewPlan, type ReviewExercise, type ReviewInput } from "./coach-review";
import { planExerciseSchema, planRunSchema } from "./session-plan";

const entry = (input: Partial<{ action: string; sets: unknown[] }> = {}) =>
  planExerciseSchema.parse({ exerciseSlug: "high-bar-squat", ...input });

const exercise = (overrides: Partial<ReviewExercise> = {}): ReviewExercise => ({
  name: "High-bar squat",
  entry: entry({ sets: [{ weight: 100, reps: 5, rir: 2 }] }),
  lastWorkingWeight: 100,
  weightStep: 2.5,
  isStrengthCompound: true,
  unit: "kg",
  ...overrides,
});

/** Defaults the day's set count to what the plan asks for, so only volume tests see drift. */
const review = (input: Partial<ReviewInput> = {}) => {
  const exercises = input.exercises ?? [exercise()];
  const asked = exercises
    .filter((e) => e.entry.action !== "drop")
    .reduce((total, e) => total + e.entry.sets.filter((set) => set.setType !== "warmup").length, 0);
  return reviewPlan({
    exercises,
    plannedSets: asked,
    run: { planned: null, lastDurationMinutes: null },
    ...input,
  });
};

describe("reading a plan back", () => {
  it("says nothing about a plan that follows on from the last one", () => {
    expect(review()).toEqual([]);
  });

  it("notices a load that jumps further than a few of its own steps", () => {
    const jump = review({
      exercises: [
        exercise({ entry: entry({ sets: [{ weight: 120, reps: 5, rir: 2 }] }) }),
        exercise({
          name: "Cable row",
          entry: entry({ sets: [{ weight: 45, reps: 10, rir: 2 }] }),
          lastWorkingWeight: 40,
          isStrengthCompound: false,
        }),
      ],
    });
    expect(jump).toEqual([
      {
        code: "big_jump",
        message: "High-bar squat jumps from 100 to 120 kg, which is more than a usual step.",
      },
    ]);
  });

  it("leaves a big proportional jump alone when it is only a step or two of the machine", () => {
    // 5 kg on a 4 kg stack is 25% but only just over one increment: not worth saying.
    expect(
      review({
        exercises: [
          exercise({
            name: "Lateral raise",
            entry: entry({ sets: [{ weight: 25, reps: 12, rir: 2 }] }),
            lastWorkingWeight: 20,
            weightStep: 4,
            isStrengthCompound: false,
          }),
        ],
      }),
    ).toEqual([]);
  });

  it("holds strength compounds to an RIR floor and leaves accessories alone", () => {
    const codes = (isStrengthCompound: boolean) =>
      review({
        exercises: [
          exercise({
            isStrengthCompound,
            entry: entry({ sets: [{ weight: 100, reps: 5, rir: 0 }] }),
          }),
        ],
      }).map((warning) => warning.code);
    expect(codes(true)).toEqual(["low_rir"]);
    expect(codes(false)).toEqual([]);
  });

  it("counts working sets against the day, ignoring warm-ups and dropped slots", () => {
    const sets = (count: number) =>
      Array.from({ length: count }, () => ({ weight: 100, reps: 5, rir: 2 }));
    expect(
      review({
        exercises: [
          exercise({
            entry: entry({ sets: [{ setType: "warmup", weight: 40, reps: 8 }, ...sets(1)] }),
          }),
        ],
        plannedSets: 12,
      }),
    ).toMatchObject([
      { code: "volume_drift", message: "1 working set against the programme's 12." },
    ]);
    expect(
      review({ exercises: [exercise({ entry: entry({ sets: sets(4) }) })], plannedSets: 4 }),
    ).toEqual([]);
  });

  it("says when most of the day is left out", () => {
    const dropped = (name: string) =>
      exercise({ name, entry: entry({ action: "drop", sets: [] }), lastWorkingWeight: null });
    expect(review({ exercises: [exercise(), dropped("a"), dropped("b")] })).toEqual([]);
    expect(
      review({ exercises: [exercise(), dropped("a"), dropped("b"), dropped("c")] }),
    ).toMatchObject([{ code: "many_drops" }]);
  });

  it("includes unchanged programme sets when a coach plan only adjusts part of the day", () => {
    expect(
      review({
        exercises: [exercise({ entry: entry({ sets: [{ weight: 100, reps: 5, rir: 2 }] }) })],
        plannedSets: 12,
        unchangedSets: 11,
      }),
    ).toEqual([]);
  });

  it("notices a run that grows much longer than the last one", () => {
    const run = (durationMinutes: number) => planRunSchema.parse({ durationMinutes });
    expect(
      review({ run: { planned: run(40), lastDurationMinutes: 25 } }).map((w) => w.code),
    ).toEqual(["run_jump"]);
    expect(review({ run: { planned: run(30), lastDurationMinutes: 25 } })).toEqual([]);
    // Nothing to compare against on a first run.
    expect(review({ run: { planned: run(60), lastDurationMinutes: null } })).toEqual([]);
  });
});
