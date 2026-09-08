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
  rirMin: 1,
  rirMax: 2,
  rule: { kind: "double_progression", loadIncrement: null },
  loadIncrement: 2.5,
  unit: "kg",
};

const squat: Prescription = {
  sets: 3,
  prescriptionType: "reps",
  repMin: 4,
  repMax: 6,
  durationMinSeconds: null,
  durationMaxSeconds: null,
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
  return { setIndex, setType: "working", weight, reps, rir, durationSeconds: null, ...extra };
}

describe("double progression", () => {
  it("recommends a load increase only after every set hits the top at target RIR", () => {
    const all = [set(1, 40, 10, 2), set(2, 40, 10, 1), set(3, 40, 10, 1)];
    const s = suggestNext(accessory, all, "same_equipment");
    expect(s.kind).toBe("increase");
    expect(s.sets.map((x) => [x.weight, x.reps, x.rir])).toEqual([
      [42.5, 6, 1],
      [42.5, 6, 1],
      [42.5, 6, 1],
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

  it("reduces when the first set fell below the minimum", () => {
    const s = suggestNext(
      accessory,
      [set(1, 40, 5, 0), set(2, 40, 6, 1), set(3, 40, 6, 1)],
      "same_equipment",
    );
    expect(s.kind).toBe("reduce");
    expect(s.sets[0]).toMatchObject({ weight: 37.5, reps: 6, rir: 1 });
  });

  it("repeats when reps were in range but a set was much harder than planned", () => {
    const s = suggestNext(
      accessory,
      [set(1, 40, 8, 1), set(2, 40, 7, 0), set(3, 40, 6, 1)],
      "same_equipment",
    );
    expect(s.kind).toBe("repeat");
    expect(s.advice).toMatch(/37.5 kg/);
    expect(s.sets.map((x) => x.reps)).toEqual([8, 7, 6]);
  });

  it("ignores warm-up sets and keeps them in the prefill unchanged", () => {
    const s = suggestNext(
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
    expect(s.sets[1]).toMatchObject({ weight: 42.5 });
  });

  it("adds load from bodyweight when the plan says so", () => {
    const pullUp: Prescription = { ...accessory, loadIncrement: 2.5 };
    const s = suggestNext(
      pullUp,
      [set(1, 0, 10, 2), set(2, null, 10, 1), set(3, 0, 10, 1)],
      "exercise",
    );
    expect(s.kind).toBe("increase");
    expect(s.sets.map((x) => x.weight)).toEqual([2.5, 2.5, 2.5]);
  });
});

describe("conservative strength", () => {
  it("adds the configured jump only after every set reaches the required reps", () => {
    const done = [set(1, 55, 6, 3), set(2, 55, 6, 2), set(3, 55, 6, 2)];
    const s = suggestNext(squat, done, "exercise");
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
    const s = suggestNext(
      plank,
      [
        set(1, null, null, 2, { durationSeconds: 30 }),
        set(2, null, null, 2, { durationSeconds: 42 }),
      ],
      "exercise",
    );
    expect(s.kind).toBe("extend");
    expect(s.sets.map((x) => x.durationSeconds)).toEqual([35, 45]);
  });

  it("holds with advice once every set is at the maximum", () => {
    const s = suggestNext(
      plank,
      [
        set(1, null, null, 2, { durationSeconds: 45 }),
        set(2, null, null, 3, { durationSeconds: 45 }),
      ],
      "exercise",
    );
    expect(s.kind).toBe("hold");
    expect(s.advice).toMatch(/add load/i);
  });
});

describe("history edge cases", () => {
  it("has nothing to prefill without comparable history", () => {
    expect(suggestNext(accessory, null, "none").kind).toBe("start");
    expect(suggestNext(accessory, [], "same_equipment").kind).toBe("start");
  });

  it("copies a different-machine performance as a starting guess without applying the rule", () => {
    const s = suggestNext(
      accessory,
      [set(1, 60, 10, 2), set(2, 60, 10, 2), set(3, 60, 10, 2)],
      "other_equipment",
    );
    expect(s.kind).toBe("transfer");
    expect(s.sets.map((x) => x.weight)).toEqual([60, 60, 60]);
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
