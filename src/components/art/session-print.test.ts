import { describe, expect, it } from "vitest";

import type { PrintedExercise, PrintedSession } from "@/domain/session-print";

import { sessionParts } from "./session-print";

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
