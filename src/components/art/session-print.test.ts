import { describe, expect, it } from "vitest";

import type { PrintedExercise, PrintedSession } from "@/domain/session-print";

import { exerciseColumn, sessionParts } from "./session-print";

const exercise = (patch: Partial<PrintedExercise>): PrintedExercise => ({
  slotId: null,
  exerciseId: "x",
  planned: 3,
  work: 0,
  warm: 0,
  skipped: false,
  supersetGroup: null,
  ...patch,
});

// Squat day (kenji, year audit): four squats in, three warm-ups before them, three owed.
const squat = (patch: Partial<PrintedSession>): PrintedSession => ({
  drills: 6,
  warmupCompleted: false,
  completed: false,
  exercises: [
    exercise({ planned: 4, work: 4, warm: 3 }),
    exercise({ planned: 4, supersetGroup: "a" }),
    exercise({ planned: 2, supersetGroup: "a" }),
    exercise({ planned: 3, skipped: true }),
  ],
  ...patch,
});

describe("a workout's print", () => {
  it("under way, is its plan: the warm-up to do, the working sets inked as they land", () => {
    expect(sessionParts(squat({}))).toEqual([
      { kind: "mobility", segments: 6, segmentsDone: 0, state: "todo", modules: 3 },
      {
        kind: "strength",
        columns: [
          { sets: 4, done: 4, skipped: false, pair: false },
          { sets: 4, done: 0, skipped: false, pair: true },
          { sets: 2, done: 0, skipped: false, pair: false },
          { sets: 3, done: 0, skipped: true, pair: false },
        ],
      },
    ]);
    // A set past the plan stands on its column; one added on the spot is drawn once begun.
    const more = squat({
      drills: 0,
      exercises: [exercise({ planned: 3, work: 4 }), exercise({ planned: null, work: 1 })],
    });
    expect(sessionParts(more)).toEqual([
      {
        kind: "strength",
        columns: [
          { sets: 4, done: 4, skipped: false, pair: false },
          { sets: 1, done: 1, skipped: false, pair: false },
        ],
      },
    ]);
  });

  it("finished, is its record: warm-ups grey at the foot, what was not done dashed", () => {
    const record = squat({ completed: true, warmupCompleted: true });
    expect(sessionParts(record)).toEqual([
      { kind: "mobility", segments: 6, segmentsDone: 6, state: "done", modules: 3 },
      {
        kind: "strength",
        columns: [
          { sets: 7, done: 7, warm: 3, pair: false },
          { sets: 4, done: 0, skipped: true, pair: true },
          { sets: 2, done: 0, skipped: true, pair: false },
          { sets: 3, done: 0, skipped: true, pair: false },
        ],
      },
    ]);
    // A warm-up never marked done ends dashed, as an exercise never done does.
    expect(sessionParts(squat({ completed: true }))[0]).toEqual({
      kind: "mobility",
      segments: 6,
      segmentsDone: 0,
      state: "skipped",
      modules: 3,
    });
  });

  it("draws nothing for a workout with no warm-up and nothing planned or done", () => {
    expect(sessionParts(squat({ drills: 0, exercises: [exercise({ planned: null })] }))).toEqual(
      [],
    );
  });
});

describe("one exercise's column, wherever it is drawn", () => {
  it("takes the size the row it is drawn on asks for, and nothing when it has nothing", () => {
    // Under way: the row's plan, inked as far as it is done.
    expect(exerciseColumn(4, { work: 1, warm: 2, skipped: false }, false)).toEqual({
      sets: 4,
      done: 1,
      skipped: false,
      pair: false,
    });
    expect(exerciseColumn(4, null, false, { pair: true })).toEqual({
      sets: 4,
      done: 0,
      skipped: false,
      pair: true,
    });
    // Finished: what was done, whatever the row asked; nothing done, dashed at the row's size.
    expect(exerciseColumn(4, { work: 3, warm: 0, skipped: false }, true)).toEqual({
      sets: 3,
      done: 3,
      warm: 0,
      pair: false,
    });
    expect(exerciseColumn(4, null, true)).toEqual({ sets: 4, done: 0, skipped: true, pair: false });
    // A plan's print draws the working sets alone: no plan asks for a warm-up set.
    const warmedUp = { work: 3, warm: 2, skipped: false };
    expect(exerciseColumn(4, warmedUp, true)).toEqual({ sets: 5, done: 5, warm: 2, pair: false });
    expect(exerciseColumn(4, warmedUp, true, { warmups: false })).toEqual({
      sets: 3,
      done: 3,
      pair: false,
    });
    expect(exerciseColumn(4, { ...warmedUp, work: 0 }, true, { warmups: false })).toEqual({
      sets: 4,
      done: 0,
      skipped: true,
      pair: false,
    });
    expect(exerciseColumn(0, null, true)).toBeNull();
    expect(exerciseColumn(0, null, false)).toBeNull();
  });
});
