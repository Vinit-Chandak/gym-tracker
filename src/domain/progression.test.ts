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
    // 2 at 1 RIR is 3 in hand against the 5 that 3 at 2 RIR needs: clearly short.
    const missed = straight(72.5, 2, 1);
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
    // 30 to 35 on this stack is a sixth of the load: 15 reps would land it in the range, and reps
    // build two past the top at most (ADR 0048).
    const curl: Prescription = {
      ...accessory,
      repMin: 8,
      repMax: 12,
      rirMin: 2,
      ladder: { known: [30, 35], stack: true, assisted: false },
    };
    const s = next(curl, straight(30, 12, 3));
    expect(s).toMatchObject({ kind: "hold", reason: expect.stringMatching(/big jump/) });
    expect(s.advice).toMatch(/Build to 14 reps .* starts below the range, at about 7 reps/);
    expect(targets(s)[0]).toEqual([30, 13, 2]);
    // 15 at 2 RIR there lands 35 inside the range.
    expect(targets(next(curl, straight(30, 15, 2)))[0]).toEqual([35, 8, 2]);
    // 14 at 2 RIR, at the ceiling, takes the step anyway and starts it below the range.
    const atCeiling = next(curl, straight(30, 14, 2));
    expect(atCeiling.kind).toBe("increase");
    expect(atCeiling.advice).toMatch(/starts below the range, at 7 reps/);
    expect(targets(atCeiling)[0]).toEqual([35, 7, 2]);
  });

  it("caps the reps a coarse dumbbell step asks for, then builds back from below the range", () => {
    // The incline curl: 2 × 10–15 at 1–2 RIR, 10 to 12.5 kg dumbbells. Landing the step inside
    // the range would take 21 reps at 1 RIR; reps build to 17 and no further (ADR 0048).
    const curl: Prescription = {
      ...accessory,
      sets: 2,
      repMin: 10,
      repMax: 15,
      rirMin: 1,
      rirMax: 2,
      loadIncrement: 2.5,
    };
    const two = (weight: number, reps: number, rir: number) =>
      [1, 2].map((index) => set(index, weight, reps, rir));
    // Two sessions at 16 add a rep, to the ceiling and no further.
    const building = next(curl, two(10, 16, 1), two(10, 16, 1));
    expect(building).toMatchObject({ kind: "hold", advice: expect.stringMatching(/17 reps/) });
    expect(targets(building)[0]).toEqual([10, 17, 1]);
    const stepped = next(curl, two(10, 17, 1));
    expect(stepped.kind).toBe("increase");
    expect(targets(stepped)).toEqual([
      [12.5, 7, 1],
      [12.5, 7, 1],
    ]);
    // At 12.5 kg, 7 reps is where the step was meant to start, not a miss: reps build back up.
    const landed = next(curl, two(12.5, 7, 1), two(10, 17, 1));
    expect(landed).toMatchObject({
      kind: "hold",
      reason: expect.stringMatching(/back into the range/),
    });
    expect(targets(landed)[0]).toEqual([12.5, 7, 1]);
    const climbing = next(curl, two(12.5, 8, 1), two(12.5, 7, 1), two(10, 17, 1));
    expect(targets(climbing)[0]).toEqual([12.5, 9, 1]);
    // Under the floor the step was taken knowing about, it is out of reach and goes back.
    expect(next(curl, two(12.5, 3, 1), two(10, 17, 1)).kind).toBe("revert");
  });

  it("holds a near miss at a new load rather than going back", () => {
    // 3 × 4–6 at 2 RIR: 60 × 6 at 2, then the 4-rep minimum with one in reserve less than
    // planned. One rep in hand short of the range is inside the error of a reported RIR.
    const incline: Prescription = {
      ...squat,
      repMin: 4,
      repMax: 6,
      rirMin: 2,
      rirMax: 2,
      rule: { kind: "conservative_strength", loadIncrement: 2.5, repsRequired: 6 },
    };
    const nearMiss = [set(1, 60, 6, 2), set(2, 60, 4, 1), set(3, 60, 4, 1)];
    const missed = [set(1, 60, 6, 0), set(2, 60, 3, 1)];
    const s = next(incline, nearMiss, missed, straight(55, 6, 2));
    expect(s.kind).toBe("hold");
    expect(targets(s)[0]?.[0]).toBe(60);
    // Two clear misses still go back.
    const clear = straight(60, 3, 0);
    expect(next(incline, clear, clear, straight(55, 6, 2)).kind).toBe("revert");
  });

  it("reads a heavier set tried after the work at the session's load, and starts it back there", () => {
    // 60 × 6 at 2 RIR, then 62.5 kg tried for sets 2–3 at 4 × 1 RIR. At its own load that is
    // short of the range, and read there it said 60 kg had 5 in hand: a second "miss" at 60
    // and back to 55. Read at 60, it is about 6.5 in hand: building.
    const incline: Prescription = {
      ...squat,
      repMin: 4,
      repMax: 6,
      rirMin: 2,
      rirMax: 2,
      rule: { kind: "conservative_strength", loadIncrement: 2.5, repsRequired: 6 },
    };
    const tried = [set(1, 60, 6, 2), set(2, 62.5, 4, 1), set(3, 62.5, 4, 1)];
    const missed = [set(1, 60, 6, 0), set(2, 60, 3, 1)];
    const s = next(incline, tried, missed, straight(55, 6, 2));
    expect(s.kind).toBe("hold");
    expect(targets(s)).toEqual([
      [60, 6, 2],
      [60, 4, 2],
      [60, 4, 2],
    ]);
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

describe("timed work at the top", () => {
  it("holds rather than adding time when the last session already reached the top", () => {
    const top = [
      set(1, null, null, null, { durationSeconds: 45, rpe: 7 }),
      set(2, null, null, null, { durationSeconds: 45, rpe: 7 }),
    ];
    const below = [
      set(1, null, null, null, { durationSeconds: 40, rpe: 7 }),
      set(2, null, null, null, { durationSeconds: 40, rpe: 7 }),
    ];
    const s = suggestNext(plank, top, "exercise", [
      {
        workoutExerciseId: "exercise-4",
        workoutSessionId: "session-4",
        performedAt: new Date("2026-09-04T12:00:00Z"),
        sets: top,
      },
      {
        workoutExerciseId: "exercise-1",
        workoutSessionId: "session-1",
        performedAt: new Date("2026-09-01T12:00:00Z"),
        sets: below,
      },
    ]);
    expect(s).toMatchObject({ kind: "hold", reason: expect.stringMatching(/top of the range/) });
    expect(s.sets.map((x) => x.durationSeconds)).toEqual([45, 45]);
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
