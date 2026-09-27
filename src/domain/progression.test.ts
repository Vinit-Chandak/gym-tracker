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
    // Each set is asked for what it should still have in hand at 42: 12 and 11 reps to failure
    // at 40 are about 10 and 9 there, so 9 and 8 at 1 RIR — not the bottom of the range.
    expect(s.sets.map((x) => [x.weight, x.reps, x.rir])).toEqual([
      [42, 9, 1],
      [42, 8, 1],
      [42, 8, 1],
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

describe("reading what every set had in hand (ADR 0039)", () => {
  // A bench slot: 3 × 3–5 at 2 RIR, 2.5 kg steps.
  const bench: Prescription = {
    ...accessory,
    repMin: 3,
    repMax: 5,
    rirMin: 2,
    rirMax: 3,
    loadIncrement: 2.5,
  };
  const straight = (weight: number, reps: number, rir: number | null) =>
    [1, 2, 3].map((index) => set(index, weight, reps, rir));
  /** Sessions newest first, three days apart. */
  const sessions = (...performances: PerformedSet[][]) =>
    performances.map((sets, index) => ({
      workoutExerciseId: `exercise-${index}`,
      workoutSessionId: `session-${index}`,
      performedAt: new Date(Date.UTC(2026, 8, 27 - 3 * index, 12)),
      sets,
    }));
  const next = (
    p: Prescription,
    ...performances: PerformedSet[][]
  ): ReturnType<typeof suggestNext> =>
    suggestNext(p, performances[0]!, "exercise", sessions(...performances));
  const targets = (s: ReturnType<typeof suggestNext>) =>
    s.sets.map((x) => [x.weight, x.reps, x.rir]);

  it("steps up after one session with a rep to spare at the top, at the reps it predicts", () => {
    // 70 × 5 with 3 in reserve: 8 in hand against the 7 that 5 at 2 RIR needs.
    const s = next(bench, straight(70, 5, 3));
    expect(s.kind).toBe("increase");
    expect(s.reason).toMatch(/rep to spare/);
    // About 6.7 reps to failure at 72.5, so 4 at 2 RIR.
    expect(targets(s)).toEqual([
      [72.5, 4, 2],
      [72.5, 4, 2],
      [72.5, 4, 2],
    ]);
  });

  it("steps up exactly on target only once it has been seen twice", () => {
    const once = next(bench, straight(70, 5, 2));
    expect(once).toMatchObject({ kind: "hold", advice: expect.stringMatching(/once more/) });
    expect(targets(once)[0]).toEqual([70, 5, 2]);
    const twice = next(bench, straight(70, 5, 2), straight(70, 5, 2));
    expect(twice.kind).toBe("increase");
    expect(twice.reason).toMatch(/two sessions running/);
  });

  it("holds inside the range and asks each set for what it had in hand", () => {
    const s = next(accessory, [set(1, 40, 8, 3), set(2, 40, 8, 2), set(3, 40, 7, 1)]);
    expect(s.kind).toBe("hold");
    expect(s.reason).toMatch(/had in hand/);
    // 8 with 3 in reserve is 10 at 1 RIR, 8 with 2 is 9, and 7 at the target stays 7.
    expect(targets(s)).toEqual([
      [40, 10, 1],
      [40, 9, 1],
      [40, 7, 1],
    ]);
    // Never past the top, however much one set had in hand: the hardest set decides the load.
    expect(
      targets(next(accessory, [set(1, 40, 9, 6), set(2, 40, 7, 1), set(3, 40, 7, 1)]))[0],
    ).toEqual([40, 10, 1]);
    // Nor at the next load: 15 reps to failure at 40 is about 12.9 at 42, still capped at 10.
    expect(targets(next(accessory, straight(40, 9, 6)))[0]).toEqual([42, 10, 1]);
  });

  it("adds a rep once two sessions met the range with nothing left over", () => {
    const once = next(accessory, straight(40, 8, 1));
    expect(once.reason).toMatch(/reps build before load/);
    expect(targets(once)[0]).toEqual([40, 8, 1]);
    const twice = next(accessory, straight(40, 8, 1), straight(40, 8, 1));
    expect(twice.reason).toMatch(/add one rep/);
    expect(targets(twice)[0]).toEqual([40, 9, 1]);
  });

  it("goes back to the load that last worked when a step misses the range twice", () => {
    const missed = straight(72.5, 2, 2);
    const s = next(bench, missed, missed, straight(70, 5, 3));
    expect(s.kind).toBe("revert");
    expect(s.reason).toMatch(/72.5 kg missed the range twice: back to 70 kg/);
    expect(targets(s)).toEqual([
      [70, 5, 2],
      [70, 5, 2],
      [70, 5, 2],
    ]);
    // One miss is one bad day: the older rule holds the load.
    const once = next(bench, missed, straight(70, 5, 3));
    expect(once.kind).toBe("hold");
    expect(targets(once)[0]?.[0]).toBe(72.5);
    // Back at 70, a rep to spare once is how 72.5 was reached last time. It takes two now.
    const back = next(bench, straight(70, 5, 3), missed, missed, straight(70, 5, 3));
    expect(back).toMatchObject({ kind: "hold", reason: expect.stringMatching(/didn't hold/) });
    expect(
      next(bench, straight(70, 5, 3), straight(70, 5, 3), missed, missed, straight(70, 5, 3)).kind,
    ).toBe("increase");
  });

  it("builds reps past the top where the next weight is too big a jump to land in the range", () => {
    // 30 to 35 on this stack is a sixth of the load.
    const curl: Prescription = {
      ...accessory,
      repMin: 8,
      repMax: 12,
      rirMin: 2,
      ladder: { known: [30, 35], stack: true, assisted: false },
    };
    const s = next(curl, straight(30, 12, 3));
    expect(s).toMatchObject({ kind: "hold", reason: expect.stringMatching(/big jump/) });
    expect(s.advice).toMatch(/Build to 15 reps/);
    expect(targets(s)[0]).toEqual([30, 13, 2]);
    // 15 at 2 RIR there lands 35 inside the range.
    expect(targets(next(curl, straight(30, 15, 2)))[0]).toEqual([35, 8, 2]);
  });

  it("never takes a step on a session an accepted change was already made on", () => {
    const history = sessions(straight(70, 5, 3));
    const s = suggestNext(bench, straight(70, 5, 3), "exercise", history, {
      spent: new Set(["workout:session-0"]),
    });
    expect(s).toMatchObject({ kind: "hold", reason: expect.stringMatching(/already earned/) });
  });

  it("steps an assisted machine to less help, and bodyweight nowhere", () => {
    const assisted: Prescription = {
      ...accessory,
      ladder: { known: [20, 25, 30], stack: true, assisted: true },
    };
    expect(targets(next(assisted, straight(25, 10, 3)))[0]).toEqual([20, 6, 1]);
    const pushUp = next(accessory, straight(0, 10, 3));
    expect(pushUp).toMatchObject({ kind: "hold", advice: expect.stringMatching(/Bodyweight/) });
    expect(targets(pushUp)[0]).toEqual([0, 10, 1]);
  });

  it("keeps the older rule for a session without every set's reps in reserve", () => {
    const s = next(bench, [set(1, 70, 5, 3), set(2, 70, 5, 3), set(3, 70, 5, null)]);
    expect(s.kind).toBe("hold");
    expect(s.reason).toMatch(/log RIR/i);
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
