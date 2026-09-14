import { describe, expect, it } from "vitest";

import {
  performanceScore,
  regressionStreak,
  suggestNext,
  type PerformedSet,
  type Prescription,
} from "./progression";

const accessory: Prescription = {
  sets: 3,
  prescriptionType: "reps",
  repMin: 6,
  repMax: 10,
  durationMinSeconds: null,
  durationMaxSeconds: null,
  distanceMinMeters: null,
  distanceMaxMeters: null,
  rirMin: 1,
  rirMax: 2,
  rule: { kind: "double_progression", loadIncrement: null },
  loadIncrement: 2,
  unit: "kg",
};

const squat: Prescription = {
  sets: 3,
  prescriptionType: "reps",
  repMin: 4,
  repMax: 6,
  durationMinSeconds: null,
  durationMaxSeconds: null,
  distanceMinMeters: null,
  distanceMaxMeters: null,
  rirMin: 2,
  rirMax: 3,
  rule: { kind: "conservative_strength", loadIncrement: 2.5, repsRequired: 6 },
  loadIncrement: 2.5,
  unit: "kg",
};

const plank: Prescription = {
  sets: 2,
  prescriptionType: "duration",
  repMin: null,
  repMax: null,
  durationMinSeconds: 20,
  durationMaxSeconds: 45,
  distanceMinMeters: null,
  distanceMaxMeters: null,
  rirMin: 2,
  rirMax: 2,
  rule: { kind: "time_first" },
  loadIncrement: 2.5,
  unit: "kg",
};

function set(
  setIndex: number,
  weight: number | null,
  reps: number | null,
  rir: number | null,
  extra: Partial<PerformedSet> = {},
): PerformedSet {
  return {
    setIndex,
    setType: "working",
    weight,
    reps,
    rir,
    durationSeconds: null,
    distanceMeters: null,
    ...extra,
  };
}

function confirmed(p: Prescription, sets: PerformedSet[], basis: "same_equipment" | "exercise") {
  return suggestNext(
    p,
    sets,
    basis,
    [1, 4].map((day) => ({
      workoutExerciseId: `exercise-${day}`,
      workoutSessionId: `session-${day}`,
      performedAt: new Date(`2026-09-${String(day).padStart(2, "0")}T12:00:00Z`),
      sets,
    })),
  );
}

describe("double progression", () => {
  it("recommends a load increase only after every set hits the top at target RIR", () => {
    const all = [set(1, 40, 10, 2), set(2, 40, 10, 1), set(3, 40, 10, 1)];
    expect(suggestNext(accessory, all, "same_equipment").kind).toBe("hold");
    const s = confirmed(accessory, all, "same_equipment");
    expect(s.kind).toBe("increase");
    expect(s.sets.map((x) => [x.weight, x.reps, x.rir])).toEqual([
      [42, 6, 1],
      [42, 6, 1],
      [42, 6, 1],
    ]);

    const oneShort = [set(1, 40, 10, 2), set(2, 40, 10, 1), set(3, 40, 9, 1)];
    expect(suggestNext(accessory, oneShort, "same_equipment").kind).toBe("hold");

    const tooHard = [set(1, 40, 10, 2), set(2, 40, 10, 1), set(3, 40, 10, 0)];
    expect(suggestNext(accessory, tooHard, "same_equipment").kind).not.toBe("increase");
  });

  it("holds when RIR was not logged on a top set", () => {
    const s = suggestNext(
      accessory,
      [set(1, 40, 10, null), set(2, 40, 10, 1), set(3, 40, 10, 1)],
      "same_equipment",
    );
    expect(s.kind).toBe("hold");
    expect(s.reason).toMatch(/log RIR/i);
    expect(s.sets.map((x) => x.weight)).toEqual([40, 40, 40]);
  });

  it("holds when fewer sets than planned were logged", () => {
    const s = suggestNext(accessory, [set(1, 40, 10, 2), set(2, 40, 10, 2)], "same_equipment");
    expect(s.kind).toBe("hold");
    expect(s.reason).toMatch(/2 of 3/);
  });

  it("preserves the load after one set fell below the minimum", () => {
    const s = suggestNext(
      accessory,
      [set(1, 40, 5, 0), set(2, 40, 6, 1), set(3, 40, 6, 1)],
      "same_equipment",
    );
    expect(s.kind).toBe("hold");
    expect(s.sets[0]).toMatchObject({ weight: 40, reps: 6, rir: 1 });
  });

  it("repeats when reps were in range but a set was much harder than planned", () => {
    const s = suggestNext(
      accessory,
      [set(1, 40, 8, 1), set(2, 40, 7, 0), set(3, 40, 6, 1)],
      "same_equipment",
    );
    expect(s.kind).toBe("repeat");
    expect(s.advice).toMatch(/keep the baseline/i);
    expect(s.sets.map((x) => x.reps)).toEqual([8, 7, 6]);
  });

  it("ignores warm-up sets and keeps them in the prefill unchanged", () => {
    const s = confirmed(
      accessory,
      [
        set(1, 20, 12, null, { setType: "warmup" }),
        set(2, 40, 10, 2),
        set(3, 40, 10, 1),
        set(4, 40, 10, 1),
      ],
      "same_equipment",
    );
    expect(s.kind).toBe("increase");
    expect(s.sets[0]).toMatchObject({ setIndex: 1, setType: "warmup", weight: 20, reps: 12 });
    expect(s.sets[1]).toMatchObject({ weight: 42 });
  });

  it("does not invent a feasible added load from bodyweight", () => {
    const pullUp: Prescription = { ...accessory, loadIncrement: 2.5 };
    const s = confirmed(
      pullUp,
      [set(1, 0, 10, 2), set(2, null, 10, 1), set(3, 0, 10, 1)],
      "exercise",
    );
    expect(s.kind).toBe("hold");
    expect(s.sets.map((x) => x.weight)).toEqual([0, null, 0]);
  });
});

describe("conservative strength", () => {
  it("adds the configured jump only after every set reaches the required reps", () => {
    const done = [set(1, 55, 6, 3), set(2, 55, 6, 2), set(3, 55, 6, 2)];
    const s = confirmed(squat, done, "exercise");
    expect(s.kind).toBe("increase");
    expect(s.sets.map((x) => x.weight)).toEqual([57.5, 57.5, 57.5]);
    expect(s.sets.map((x) => x.rir)).toEqual([2, 2, 2]);

    const notYet = [set(1, 55, 6, 3), set(2, 55, 5, 2), set(3, 55, 5, 2)];
    expect(suggestNext(squat, notYet, "exercise").kind).toBe("hold");

    const grinder = [set(1, 55, 6, 0), set(2, 55, 6, 0), set(3, 55, 6, 0)];
    expect(suggestNext(squat, grinder, "exercise").kind).toBe("repeat");
  });
});

describe("timed work", () => {
  it("extends time before load, capped at the top of the range", () => {
    const s = confirmed(
      plank,
      [
        set(1, null, null, null, { durationSeconds: 30, rpe: 7 }),
        set(2, null, null, null, { durationSeconds: 42, rpe: 7 }),
      ],
      "exercise",
    );
    expect(s.kind).toBe("extend");
    expect(s.sets.map((x) => x.durationSeconds)).toEqual([33, 45]);
  });

  it("holds with advice once every set is at the maximum", () => {
    const s = confirmed(
      plank,
      [
        set(1, null, null, null, { durationSeconds: 45, rpe: 7 }),
        set(2, null, null, null, { durationSeconds: 45, rpe: 7 }),
      ],
      "exercise",
    );
    expect(s.kind).toBe("hold");
    expect(s.advice).toMatch(/feasible load/i);
  });
});

describe("history edge cases", () => {
  it("has nothing to prefill without comparable history", () => {
    expect(suggestNext(accessory, null, "none").kind).toBe("start");
    expect(suggestNext(accessory, [], "same_equipment").kind).toBe("start");
  });

  it("requires calibration instead of copying another machine's load", () => {
    const s = suggestNext(
      accessory,
      [set(1, 60, 10, 2), set(2, 60, 10, 2), set(3, 60, 10, 2)],
      "other_equipment",
    );
    expect(s.kind).toBe("transfer");
    expect(s.sets.map((x) => x.weight)).toEqual([null, null, null]);
  });
});

describe("regressions", () => {
  it("scores loaded sets by best estimated 1RM and bodyweight sets by total reps", () => {
    expect(performanceScore([set(1, 60, 10, 2), set(2, 60, 8, 1)])).toBeCloseTo(80, 5);
    expect(performanceScore([set(1, 0, 10, 2), set(2, 0, 8, 1)])).toBe(18);
    expect(performanceScore([set(1, null, null, 2, { durationSeconds: 30 })])).toBe(30);
  });

  it("counts consecutive sessions below the one before, newest first", () => {
    const strong = [set(1, 60, 10, 2)];
    const weaker = [set(1, 60, 8, 1)];
    const weakest = [set(1, 57.5, 8, 1)];
    expect(regressionStreak([weakest, weaker, strong])).toBe(2);
    expect(regressionStreak([weaker, strong, weakest])).toBe(1);
    expect(regressionStreak([strong, weaker, weakest])).toBe(0);
    expect(regressionStreak([strong])).toBe(0);
  });
});
