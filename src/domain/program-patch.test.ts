import { describe, expect, it } from "vitest";

import { parseProgramBlueprint, type ProgramBlueprint } from "./program-blueprint";
import {
  applyProgramPatch,
  describePatch,
  programPatchSchema,
  ProgramPatchError,
  type ProgramPatch,
} from "./program-patch";

const SQUAT = "11111111-1111-4111-8111-111111111111";
const PRESS = "22222222-2222-4222-8222-222222222222";
const CRUNCH = "33333333-3333-4333-8333-333333333333";
const GONE = "44444444-4444-4444-8444-444444444444";

const slot = (lineageId: string, exerciseSlug: string) => ({
  exerciseSlug,
  lineageId,
  sets: 3,
  reps: [5, 8] as [number, number],
  rir: [1, 2] as [number, number],
  rest: [120, 180] as [number, number],
});

const blueprint = (): ProgramBlueprint =>
  parseProgramBlueprint({
    blueprintVersion: 1,
    slug: "test-plan",
    name: "Test plan",
    weeks: 4,
    days: [
      {
        dayIndex: 1,
        dayOfWeek: 2,
        name: "Lower",
        includesLifting: true,
        includesRun: false,
        warmupSlug: "daily-mobility",
        exercises: [slot(SQUAT, "high-bar-squat"), slot(CRUNCH, "cable-crunch")],
      },
      {
        dayIndex: 2,
        dayOfWeek: 4,
        name: "Upper",
        includesLifting: true,
        includesRun: true,
        warmupSlug: "daily-mobility",
        exercises: [slot(PRESS, "barbell-bench-press")],
      },
    ],
    runs: [
      {
        weekIndex: 1,
        dayOfWeek: 4,
        duration: [20, 25],
        rpe: [3, 4],
        paceNote: "Conversational.",
        shinRule: "Stop if the shins bark.",
      },
    ],
  });

const patch = (...operations: unknown[]): ProgramPatch => programPatchSchema.parse({ operations });

const day = (plan: ProgramBlueprint, dayIndex: number) =>
  plan.days.find((entry) => entry.dayIndex === dayIndex)!;

describe("a change to the programme itself", () => {
  it("swaps a movement while the slot keeps its place and its lineage", () => {
    const next = applyProgramPatch(
      blueprint(),
      patch({
        op: "substitute",
        lineageId: SQUAT,
        exerciseSlug: "front-squat",
        reason: "The knee prefers a front squat.",
      }),
    );
    expect(day(next, 1).exercises.map((e) => e.exerciseSlug)).toEqual([
      "front-squat",
      "cable-crunch",
    ]);
    expect(day(next, 1).exercises[0]).toMatchObject({
      lineageId: SQUAT,
      sets: 3,
      notes: "The knee prefers a front squat.",
    });
  });

  it("adjusts only what the operation names", () => {
    const next = applyProgramPatch(
      blueprint(),
      patch({ op: "adjust", lineageId: PRESS, sets: 4, rir: [2, 3], reason: "More volume." }),
    );
    expect(day(next, 2).exercises[0]).toMatchObject({
      exerciseSlug: "barbell-bench-press",
      sets: 4,
      reps: [5, 8],
      rir: [2, 3],
      rest: [120, 180],
    });
  });

  it("clears reps when an adjustment makes a slot timed, and the other way round", () => {
    const timed = applyProgramPatch(
      blueprint(),
      patch({ op: "adjust", lineageId: CRUNCH, duration: [30, 45], reason: "Hold it instead." }),
    );
    expect(day(timed, 1).exercises[1]).toMatchObject({ duration: [30, 45] });
    expect(day(timed, 1).exercises[1]?.reps).toBeUndefined();
    const back = applyProgramPatch(
      timed,
      patch({ op: "adjust", lineageId: CRUNCH, reps: [10, 15], reason: "Reps again." }),
    );
    expect(day(back, 1).exercises[1]?.duration).toBeUndefined();
  });

  it("removes a slot and adds one where it is asked for", () => {
    const removed = applyProgramPatch(
      blueprint(),
      patch({ op: "remove", lineageId: CRUNCH, reason: "The abs are covered elsewhere." }),
    );
    expect(day(removed, 1).exercises.map((e) => e.exerciseSlug)).toEqual(["high-bar-squat"]);

    const added = applyProgramPatch(
      blueprint(),
      patch({
        op: "add",
        dayIndex: 1,
        afterLineageId: SQUAT,
        exercise: { ...slot(GONE, "romanian-deadlift"), lineageId: undefined },
        reason: "The hamstrings need work.",
      }),
    );
    expect(day(added, 1).exercises.map((e) => e.exerciseSlug)).toEqual([
      "high-bar-squat",
      "romanian-deadlift",
      "cable-crunch",
    ]);
    // A new slot gets its lineage when it is written, not before.
    expect(day(added, 1).exercises[1]?.lineageId).toBeUndefined();
  });

  it("puts an addition last when no place is given", () => {
    const added = applyProgramPatch(
      blueprint(),
      patch({
        op: "add",
        dayIndex: 2,
        exercise: slot(GONE, "face-pull"),
        reason: "Shoulder health.",
      }),
    );
    expect(day(added, 2).exercises.map((e) => e.exerciseSlug)).toEqual([
      "barbell-bench-press",
      "face-pull",
    ]);
  });

  it("changes a planned run in place", () => {
    const next = applyProgramPatch(
      blueprint(),
      patch({
        op: "run",
        weekIndex: 1,
        dayOfWeek: 4,
        duration: [25, 30],
        reason: "The shins have been quiet for a fortnight.",
      }),
    );
    expect(next.runs[0]).toMatchObject({
      duration: [25, 30],
      rpe: [3, 4],
      paceNote: "Conversational.",
      shinRule: "Stop if the shins bark.",
      comment: "The shins have been quiet for a fortnight.",
    });
  });

  it("applies operations in order, so a later one sees the earlier one's result", () => {
    const next = applyProgramPatch(
      blueprint(),
      patch(
        { op: "remove", lineageId: CRUNCH, reason: "Out." },
        { op: "add", dayIndex: 1, exercise: slot(GONE, "hanging-leg-raise"), reason: "In." },
      ),
    );
    expect(day(next, 1).exercises.map((e) => e.exerciseSlug)).toEqual([
      "high-bar-squat",
      "hanging-leg-raise",
    ]);
  });

  it("refuses an operation that names something the programme no longer has", () => {
    const stale = [
      { op: "substitute", lineageId: GONE, exerciseSlug: "front-squat", reason: "x" },
      { op: "adjust", lineageId: GONE, sets: 4, reason: "x" },
      { op: "remove", lineageId: GONE, reason: "x" },
      { op: "add", dayIndex: 9, exercise: slot(GONE, "face-pull"), reason: "x" },
      { op: "run", weekIndex: 3, dayOfWeek: 4, duration: [20, 25], reason: "x" },
    ];
    for (const operation of stale) {
      expect(() => applyProgramPatch(blueprint(), patch(operation))).toThrow(ProgramPatchError);
    }
  });

  it("refuses to empty the programme", () => {
    expect(() =>
      applyProgramPatch(
        blueprint(),
        patch(
          { op: "remove", lineageId: SQUAT, reason: "x" },
          { op: "remove", lineageId: CRUNCH, reason: "x" },
          { op: "remove", lineageId: PRESS, reason: "x" },
        ),
      ),
    ).toThrow(/nothing to do/);
  });

  it("leaves the blueprint it was given untouched", () => {
    const before = blueprint();
    const snapshot = JSON.stringify(before);
    applyProgramPatch(before, patch({ op: "remove", lineageId: CRUNCH, reason: "x" }));
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("rejects a patch the app could not explain", () => {
    expect(programPatchSchema.safeParse({ operations: [] }).success).toBe(false);
    expect(
      programPatchSchema.safeParse({
        operations: [{ op: "substitute", lineageId: "not-a-uuid", exerciseSlug: "x", reason: "y" }],
      }).success,
    ).toBe(false);
    expect(
      programPatchSchema.safeParse({
        operations: [{ op: "adjust", lineageId: SQUAT, reps: [8, 5], reason: "y" }],
      }).success,
    ).toBe(false);
    expect(
      programPatchSchema.safeParse({ operations: [{ op: "invent", lineageId: SQUAT }] }).success,
    ).toBe(false);
  });

  it("says what each operation would do, one line apiece", () => {
    expect(
      describePatch(
        patch(
          { op: "substitute", lineageId: SQUAT, exerciseSlug: "front-squat", reason: "Knee." },
          { op: "adjust", lineageId: PRESS, sets: 4, rir: [2, 3], reason: "More volume." },
          { op: "run", weekIndex: 1, dayOfWeek: 4, duration: [25, 30], reason: "Shins fine." },
        ),
      ),
    ).toEqual([
      "Swap in front squat. Knee.",
      "Change to 4 sets, 2–3 RIR. More volume.",
      "Change the week 1 run. Shins fine.",
    ]);
  });
});
