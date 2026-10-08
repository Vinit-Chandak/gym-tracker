import { describe, expect, it } from "vitest";
import {
  capacityAt,
  landingFloor,
  lighterSessions,
  median,
  repCeiling,
  summarizeExerciseEvidence,
  type EvidencePerformance,
} from "./training-evidence";
import { suggestNext, type Prescription } from "./progression";
import { effortError } from "./effort";

const p: Prescription = {
  sets: 2,
  prescriptionType: "reps",
  repMin: 8,
  repMax: 12,
  durationMinSeconds: null,
  durationMaxSeconds: null,
  distanceMinMeters: null,
  distanceMaxMeters: null,
  rirMin: 2,
  rirMax: 3,
  rule: { kind: "double_progression", loadIncrement: null },
  loadIncrement: 2.5,
  unit: "kg",
};
function history(values: number[], rir: number | null = 2): EvidencePerformance[] {
  return values.map((reps, index) => ({
    workoutExerciseId: `e${index}`,
    workoutSessionId: `w${index}`,
    performedAt: new Date(Date.UTC(2026, 8, 14 - index * 3)),
    sets: [1, 2].map((setIndex) => ({
      setIndex,
      setType: "working",
      reps,
      rir,
      weight: 50,
      unit: "kg",
      durationSeconds: null,
      distanceMeters: null,
    })),
  }));
}

describe("noise-aware exercise evidence", () => {
  it("holds one outlier while recognizing repeated decline against an earlier reference", () => {
    expect(summarizeExerciseEvidence(p, history([5, 10, 10, 10, 10, 10])).declineCandidate).toBe(
      false,
    );
    const decline = summarizeExerciseEvidence(p, history([5, 6, 6, 10, 10, 10]));
    expect(decline).toMatchObject({
      baseline: 10,
      recentMedian: 6,
      mad: 0,
      threshold: 0.1,
      declineCandidate: true,
    });
    expect(decline.relativeChange).toBeCloseTo(-0.4);
    expect(
      suggestNext(p, history([5])[0]!.sets, "exercise", history([5, 6, 6, 10, 10, 10])).kind,
    ).toBe("reduce");
  });
  it("vetoes a cut when the latest performance recovers", () => {
    expect(summarizeExerciseEvidence(p, history([10, 5, 5, 10, 10, 10])).declineCandidate).toBe(
      false,
    );
    // Recovery to the observed baseline still counts when the original target was too high.
    expect(
      summarizeExerciseEvidence({ ...p, repMin: 12 }, history([10, 5, 5, 10, 10, 10]))
        .declineCandidate,
    ).toBe(false);
  });
  it("retains an established reference instead of following a lower moving baseline", () => {
    const first = summarizeExerciseEvidence(p, history([6, 6, 6, 10, 10, 10]));
    const next = history([6, 6, 6, 6, 6, 6]);
    next.forEach((item, index) => {
      item.workoutSessionId = `new${index}`;
    });
    const retained = summarizeExerciseEvidence(p, next, first.reference);
    expect(retained.baseline).toBe(10);
    expect(retained.declineCandidate).toBe(true);
  });
  it("does not treat missing effort as failure or sufficient progression evidence", () => {
    expect(summarizeExerciseEvidence(p, history([12, 12], null))).toMatchObject({
      progressionReady: false,
      repeatedCompletion: false,
      matchingCount: 0,
    });
    expect(
      summarizeExerciseEvidence(p, history([5, 5, 5, 10, 10, 10], null)).declineCandidate,
    ).toBe(false);
  });

  it("compares an effort nobody labelled, and keeps saying nobody labelled it", () => {
    // `effortReported` is false by default on every row written before the app recorded the
    // answer, so it marks unknown provenance rather than a number copied from the target.
    // Excluding it meant an exercise stayed on insufficient evidence for as long as its
    // history was old, however plainly the loads and reps had earned the next step.
    const legacy = history([12, 12]);
    legacy.forEach((item) => {
      item.sets = item.sets.map((set) => ({ ...set, effortReported: false }));
    });
    expect(summarizeExerciseEvidence(p, legacy)).toMatchObject({
      progressionReady: true,
      effortCoverage: { known: 2, confirmed: 0, total: 2 },
    });
    expect(legacy[0]!.sets[0]!.rir).toBe(2);
    // An effort that was never entered is still nothing to compare: unknown provenance and
    // a missing number are different failures, and only the first one was overstated.
    const missing = history([12, 12], null);
    missing.forEach((item) => {
      item.sets = item.sets.map((set) => ({ ...set, effortReported: false }));
    });
    expect(summarizeExerciseEvidence(p, missing)).toMatchObject({
      progressionReady: false,
      effortCoverage: { known: 0, confirmed: 0, total: 2 },
    });
  });
  it("needs complete working sets and two distinct local dates", () => {
    const two = history([12, 12]);
    two.forEach((item) => {
      item.performedOn = "2026-09-14";
    });
    expect(summarizeExerciseEvidence(p, two).progressionReady).toBe(false);
    const missingSet = history([12, 12]);
    missingSet[0]!.sets = missingSet[0]!.sets.slice(0, 1);
    expect(summarizeExerciseEvidence(p, missingSet).progressionReady).toBe(false);
  });
  it("normalizes physical units but refuses unitless stack comparisons", () => {
    const two = history([12, 12]);
    two[1]!.sets = two[1]!.sets.map((set) => ({ ...set, weight: 110.23, unit: "lb" }));
    expect(summarizeExerciseEvidence(p, two).progressionReady).toBe(true);
    two[1]!.sets = two[1]!.sets.map((set) => ({ ...set, weight: 50, unit: "stack_index" }));
    expect(summarizeExerciseEvidence(p, two).progressionReady).toBe(false);
  });
  it("compares the complete working-set load profile, not only the first set", () => {
    const two = history([12, 12]);
    two[1]!.sets = two[1]!.sets.map((set) => ({ ...set, weight: set.setIndex === 2 ? 25 : 50 }));
    expect(summarizeExerciseEvidence(p, two).progressionReady).toBe(false);
  });
  it("checks effort and load comparability, and allows rep progression before load", () => {
    const two = history([10, 10]);
    const suggestion = suggestNext(p, two[0]!.sets, "exercise", two);
    expect(suggestion.sets[0]).toMatchObject({ weight: 50, reps: 11 });
    two[1]!.sets = two[1]!.sets.map((set) => ({ ...set, rir: 5 }));
    expect(summarizeExerciseEvidence(p, two).repeatedCompletion).toBe(false);
  });
  it("steps to the next load that exists at home, however coarse, and never guesses one", () => {
    const two = history([12, 12]);
    const rack = (known: number[]) => ({ known, stack: false, assisted: false });
    const home = { ...p, requireKnownLoads: true, ladder: rack([50, 52, 55]) };
    expect(suggestNext(home, two[0]!.sets, "exercise", two).sets[0]?.weight).toBe(52);
    // 55 is 10% above 50, and the only step this rack has: one real step is always allowed.
    expect(
      suggestNext({ ...home, ladder: rack([50, 55]) }, two[0]!.sets, "exercise", two).sets[0]
        ?.weight,
    ).toBe(55);
    // Nothing listed: the typed increment would be a guess, and a guess is not a home load.
    expect(suggestNext({ ...home, ladder: rack([]) }, two[0]!.sets, "exercise", two).kind).toBe(
      "hold",
    );
  });
  it("does not respond to a one-unit change or interpret a slope as a diagnosis", () => {
    expect(median([1, 9, 3, 5])).toBe(4);
    expect(summarizeExerciseEvidence(p, history([9, 9, 9, 10, 10, 10])).declineCandidate).toBe(
      false,
    );
    const slope = summarizeExerciseEvidence(p, history([12, 11, 10]));
    expect(slope.slopePerWeek).toBeCloseTo(7 / 3);
  });
});

it("requires the appropriate actual effort metric, while permitting warmups and honest zero RIR", () => {
  const set = history([10])[0]!.sets[0]!;
  expect(effortError({ ...set, rir: null })).toMatch(/Enter RIR/);
  expect(effortError({ ...set, rir: 0 })).toBeNull();
  expect(effortError({ ...set, rir: null, setType: "warmup" })).toBeNull();
  expect(effortError({ ...set, reps: null, durationSeconds: 30, rir: 2 })).toMatch(/Enter effort/);
  expect(effortError({ ...set, reps: null, durationSeconds: 30, rir: null, rpe: 7 })).toBeNull();
});

describe("readiness from the hardest set (ADR 0039)", () => {
  // Upper A's bench: 4 × 3–5 at 2 RIR, 2.5 kg steps once all four sets reach 5.
  const bench: Prescription = {
    sets: 4,
    prescriptionType: "reps",
    repMin: 3,
    repMax: 5,
    durationMinSeconds: null,
    durationMaxSeconds: null,
    distanceMinMeters: null,
    distanceMaxMeters: null,
    rirMin: 2,
    rirMax: 2,
    rule: { kind: "conservative_strength", loadIncrement: 2.5, repsRequired: 5 },
    loadIncrement: 2.5,
    unit: "kg",
  };
  /** One session per entry, newest first: [load, [reps, rir] for each of the four sets]. */
  const sessions = (...entries: [number, [number | null, number | null][]][]) =>
    entries.map(([weight, sets], index) => ({
      workoutExerciseId: `e${index}`,
      workoutSessionId: `w${index}`,
      performedAt: new Date(Date.UTC(2026, 8, 20 - index * 7)),
      sets: sets.map(([reps, rir], setIndex) => ({
        setIndex: setIndex + 1,
        setType: "working" as const,
        weight,
        reps,
        rir,
        unit: "kg" as const,
        durationSeconds: null,
        distanceMeters: null,
      })),
    }));
  const four = (reps: number, rir: number): [number, number][] =>
    Array.from({ length: 4 }, () => [reps, rir]);

  it("steps up at once when even the hardest set had a rep to spare at the top", () => {
    // 70 × 5 at 3 RIR on every set: 8 in hand against the 7 that 5 at 2 RIR needs.
    const evidence = summarizeExerciseEvidence(bench, sessions([70, four(5, 3)]));
    expect(evidence).toMatchObject({
      readiness: "spare",
      loadReady: "spare",
      stepEvidenceIds: ["workout:w0"],
    });
    expect(evidence.observations[0]?.capacity).toBe(8);
  });

  it("reads the hardest set, not the first, and asks exactly-on-target to show it twice", () => {
    const tired: [number, number][] = [...four(5, 3).slice(0, 3), [5, 2]];
    const once = summarizeExerciseEvidence(bench, sessions([70, tired]));
    expect(once).toMatchObject({ readiness: "on_target", loadReady: null });
    const twice = summarizeExerciseEvidence(bench, sessions([70, tired], [70, four(5, 2)]));
    expect(twice).toMatchObject({
      loadReady: "confirmed",
      stepEvidenceIds: ["workout:w0", "workout:w1"],
    });
    // Twice on target, but at different loads, is not the same thing seen twice.
    expect(
      summarizeExerciseEvidence(bench, sessions([70, tired], [67.5, four(5, 2)])).loadReady,
    ).toBeNull();
    // A tired last set that still had the top in hand is on target, not short of it.
    const shortRep: [number, number][] = [...four(5, 3).slice(0, 3), [4, 3]];
    expect(summarizeExerciseEvidence(bench, sessions([70, shortRep])).readiness).toBe("on_target");
  });

  it("holds while building, below the range, or without every set's effort", () => {
    expect(summarizeExerciseEvidence(bench, sessions([70, four(4, 2)])).readiness).toBe("building");
    expect(
      summarizeExerciseEvidence(
        bench,
        sessions([
          70,
          [
            [3, 2],
            [3, 2],
            [2, 2],
            [2, 2],
          ],
        ]),
      ).readiness,
    ).toBe("below");
    const unknown = summarizeExerciseEvidence(
      bench,
      sessions([
        70,
        [
          [5, 3],
          [5, 3],
          [5, 3],
          [5, null],
        ],
      ]),
    );
    expect(unknown).toMatchObject({ readiness: "unknown", loadReady: null });
    expect(summarizeExerciseEvidence(bench, sessions([70, four(5, 3).slice(0, 3)])).readiness).toBe(
      "unknown",
    );
  });

  it("goes back to the load that last worked when a step misses twice in its first three sessions", () => {
    // Clearly short: 3 in hand against the 5 that 3 at 2 RIR needs, past the near-miss margin.
    const below: [number, number][] = [
      [3, 1],
      [2, 1],
      [2, 1],
      [2, 1],
    ];
    const failed = summarizeExerciseEvidence(
      bench,
      sessions([72.5, below], [72.5, below], [70, four(5, 3)]),
    );
    // Back to each set's load the last time at 70, asked for what the hardest set had there.
    expect(failed.revert).toEqual({
      load: 70,
      loads: [70, 70, 70, 70],
      capacity: 8,
      evidenceIds: ["workout:w0", "workout:w1"],
      reason: "missed_twice",
      to: "before_step",
    });
    expect(failed.state).toBe("step_did_not_hold");
    // Two misses and then a session in the range: the load has held after all.
    expect(
      summarizeExerciseEvidence(
        bench,
        sessions([72.5, four(4, 2)], [72.5, below], [72.5, below], [70, four(5, 3)]),
      ).revert,
    ).toBeNull();
    // One miss is one bad day.
    expect(
      summarizeExerciseEvidence(
        bench,
        sessions([72.5, below], [72.5, four(4, 2)], [70, four(5, 3)]),
      ).revert,
    ).toBeNull();
    // Four sessions in, the new load is simply where the athlete trains now.
    expect(
      summarizeExerciseEvidence(
        bench,
        sessions(
          [72.5, below],
          [72.5, below],
          [72.5, four(4, 2)],
          [72.5, four(4, 2)],
          [70, four(5, 3)],
        ),
      ).revert,
    ).toBeNull();
    // Back at 70, one spare session is how 72.5 was reached last time: it takes two now.
    const back = sessions([70, four(5, 3)], [72.5, below], [72.5, below], [70, four(5, 3)]);
    expect(summarizeExerciseEvidence(bench, back).loadReady).toBeNull();
    expect(
      summarizeExerciseEvidence(bench, [
        ...sessions([70, four(5, 3)]),
        ...back.map((item, index) => ({
          ...item,
          workoutSessionId: `later${index}`,
          performedAt: new Date(item.performedAt.getTime() - 7 * 86_400_000),
        })),
      ]).loadReady,
    ).toBe("confirmed");
  });

  it("learns from each step how far the athlete's reported reserve can be trusted", () => {
    // 70 × 5 at 3 predicted about 6.7 reps to failure at 72.5, and they had 5; 67.5 × 5 at 3
    // predicted about 6.6 at 70, and they had 6. Both steps found less in hand than was reported.
    const short = sessions(
      [72.5, four(3, 2)],
      [70, four(5, 3)],
      [70, four(4, 2)],
      [67.5, four(5, 3)],
    );
    const evidence = summarizeExerciseEvidence(bench, short);
    expect(evidence.calibration.steps).toBe(2);
    expect(evidence.calibration.meanError).toBeLessThanOrEqual(-1);
    // So a single spare rep is not enough on its own word any more: it needs a second session.
    expect(
      summarizeExerciseEvidence(bench, [
        ...sessions([72.5, four(5, 3)]),
        ...short.map((item) => ({
          ...item,
          performedAt: new Date(item.performedAt.getTime() - 7 * 86_400_000),
        })),
      ]).readiness,
    ).toBe("on_target");
  });

  it("estimates a maximum from sets close to failure only, and follows it across loads", () => {
    const evidence = summarizeExerciseEvidence(
      bench,
      sessions([72.5, four(5, 2)], [70, four(5, 3)], [67.5, four(5, 3)]),
    );
    expect(evidence.observations[1]?.estimatedMax).toBeCloseTo(88.7, 1);
    expect(evidence.estimatedMax).toMatchObject({ sessions: 3, latest: 89.4 });
    expect(evidence.estimatedMax.perWeek).toBeGreaterThan(0);
    // Twenty reps to failure is past where the curve means anything.
    expect(
      summarizeExerciseEvidence(bench, sessions([40, four(15, 5)])).observations[0]?.estimatedMax,
    ).toBeNull();
    // An assisted machine's number is help, not load: nothing is estimated from it.
    expect(
      summarizeExerciseEvidence(bench, sessions([30, four(5, 3)]), null, { assisted: true })
        .observations[0]?.estimatedMax,
    ).toBeNull();
  });
});

describe("a load never held in the range, and the body under the load (ADR 0040)", () => {
  // Lower B's deadlift: 3 × 3–5 at 2–3 RIR, 2.5 kg steps.
  const deadlift: Prescription = {
    sets: 3,
    prescriptionType: "reps",
    repMin: 3,
    repMax: 5,
    durationMinSeconds: null,
    durationMaxSeconds: null,
    distanceMinMeters: null,
    distanceMaxMeters: null,
    rirMin: 2,
    rirMax: 3,
    rule: { kind: "double_progression", loadIncrement: null },
    loadIncrement: 2.5,
    unit: "kg",
  };
  /** One session per entry, newest first: [load, [reps, rir] for each set logged]. */
  const sessions = (...entries: [number, [number, number | null][]][]) =>
    entries.map(([weight, sets], index) => ({
      workoutExerciseId: `e${index}`,
      workoutSessionId: `w${index}`,
      performedAt: new Date(Date.UTC(2026, 8, 20 - index * 7)),
      sets: sets.map(([reps, rir], setIndex) => ({
        setIndex: setIndex + 1,
        setType: "working" as const,
        weight,
        reps,
        rir,
        unit: "kg" as const,
        durationSeconds: null,
        distanceMeters: null,
      })),
    }));
  const straight = (count: number, reps: number, rir: number): [number, number][] =>
    Array.from({ length: count }, () => [reps, rir]);
  const next = (p: Prescription, history: EvidencePerformance[]) =>
    suggestNext(p, history[0]!.sets, "exercise", history);

  it("goes back at once from a heavy single at a load never held, to the last load that was", () => {
    // 120 × 3 at 2 RIR held the range; the 125 single had one rep in hand and the range starts
    // at three. Held, it asked for three at 2 RIR: five in hand, where the single had one.
    const history = sessions([125, [[1, 0]]], [120, straight(3, 3, 2)]);
    const evidence = summarizeExerciseEvidence(deadlift, history);
    expect(evidence.readiness).toBe("below");
    expect(evidence.observations[0]?.hardest).toBe(1);
    expect(evidence.revert).toEqual({
      load: 120,
      loads: [120, 120, 120],
      capacity: 5,
      evidenceIds: ["workout:w0"],
      reason: "out_of_reach",
      to: "last_held",
    });
    expect(evidence.state).toBe("step_did_not_hold");
    expect(evidence.nextStep).toBeNull();
    const suggestion = next(deadlift, history);
    expect(suggestion).toMatchObject({
      kind: "revert",
      reason: "125 kg had 1 rep in hand, short of the 3-rep minimum: back to 120 kg.",
    });
    expect(suggestion.sets.map((set) => [set.weight, set.reps, set.rir])).toEqual([[120, 3, 2]]);
  });

  it("with no load held before it, goes back to the load the single puts in the range", () => {
    // One rep to failure at 125 is five, three at 2 RIR, at about 110.7: 110 is the real load.
    const history = sessions([125, [[1, 0]]]);
    expect(summarizeExerciseEvidence(deadlift, history).revert).toEqual({
      load: 110,
      loads: [],
      capacity: 5,
      evidenceIds: ["workout:w0"],
      reason: "out_of_reach",
      to: "fitted",
    });
    expect(next(deadlift, history).sets.map((set) => [set.weight, set.reps, set.rir])).toEqual([
      [110, 3, 2],
    ]);
    // Nothing is fitted along an assisted machine's help, which is not read along the curve.
    expect(
      summarizeExerciseEvidence(deadlift, history, null, { assisted: true }).revert,
    ).toBeNull();
  });

  it("keeps the older rule for a low day at a load once held, and for a near miss at a new one", () => {
    // 125 held the range last time: one poor single there is a bad day, not a lost load.
    expect(
      summarizeExerciseEvidence(deadlift, sessions([125, [[1, 0]]], [125, straight(3, 3, 2)]))
        .revert,
    ).toBeNull();
    // So is one at 125 after a lighter week, where 130 held the range before it.
    expect(
      summarizeExerciseEvidence(
        deadlift,
        sessions([125, [[1, 0]]], [110, straight(3, 3, 2)], [130, straight(3, 3, 2)]),
      ).revert,
    ).toBeNull();
    // Three at 0 RIR at a new 127.5 reached the bottom of the range: short of the target
    // effort, not out of reach. The step keeps its two-miss test.
    const near = summarizeExerciseEvidence(
      deadlift,
      sessions([127.5, straight(3, 3, 0)], [125, straight(3, 3, 2)]),
    );
    expect(near).toMatchObject({ readiness: "below", revert: null });
  });

  it("asks two sessions, not one, before stepping back up to a load that was out of reach", () => {
    // Back at 120 after the single, a rep to spare steps to 122.5 as it always did: the single
    // is no reason to slow the steps below it.
    const below = summarizeExerciseEvidence(
      deadlift,
      sessions([120, straight(3, 5, 3)], [125, [[1, 0]]], [120, straight(3, 3, 2)]),
    );
    expect(below).toMatchObject({ readiness: "spare", loadReady: "spare", revert: null });
    // At 122.5 the next step is 125 itself, and one good day is how it was reached last time.
    const next = summarizeExerciseEvidence(
      deadlift,
      sessions(
        [122.5, straight(3, 5, 3)],
        [120, straight(3, 5, 3)],
        [125, [[1, 0]]],
        [120, straight(3, 3, 2)],
      ),
    );
    expect(next).toMatchObject({ readiness: "spare", loadReady: null, revert: null });
    expect(next.nextStep).toBe(
      "125 kg comes after two sessions running with every working set at 5 reps and 2 RIR: the step above this load did not hold last time.",
    );
  });

  it("reads a session as below the range from the sets logged, but never as in it", () => {
    // One set of three: the others could only have been harder.
    expect(summarizeExerciseEvidence(deadlift, sessions([125, [[1, 0]]])).readiness).toBe("below");
    // Two sets of three in the range say nothing about the third.
    expect(summarizeExerciseEvidence(deadlift, sessions([120, straight(2, 5, 3)])).readiness).toBe(
      "unknown",
    );
  });

  // Lower B's split squat: 2 × 8–12 a side at 1–2 RIR, 2.5 kg dumbbell steps.
  const splitSquat: Prescription = {
    ...deadlift,
    sets: 2,
    repMin: 8,
    repMax: 12,
    rirMin: 1,
    rirMax: 2,
  };
  // 85% of a 75 kg athlete moves with the dumbbell.
  const withBody: Prescription = { ...splitSquat, bodyLoad: 63.75 };

  it("reads a dumbbell step on a split squat against the body it is added to", () => {
    // Against the dumbbell alone 5 to 7.5 kg is half as heavy again: reps would have to reach 28
    // a side to land the step in the range, and build to 14, two past the top, at most (ADR 0047).
    // Against body and dumbbell it is about 3.5%, and the step lands in the range.
    expect(repCeiling(splitSquat, 5, 7.5)).toBe(14);
    expect(repCeiling(withBody, 5, 7.5)).toBe(12);
    expect(capacityAt(13, 5, 7.5)).toBeLessThan(0);
    expect(capacityAt(13, 5, 7.5, 63.75)).toBeCloseTo(11.5, 1);

    // 12 a side with 2 in reserve: a rep to spare at the top, so 7.5 kg, at 11 a side.
    const spare = sessions([5, straight(2, 12, 2)]);
    expect(next(splitSquat, spare)).toMatchObject({
      kind: "hold",
      reason: "The next weight up is too big a jump to bridge with reps.",
    });
    const stepped = next(withBody, spare);
    expect(stepped.kind).toBe("increase");
    expect(stepped.sets.map((set) => [set.weight, set.reps, set.rir])).toEqual([
      [7.5, 11, 1],
      [7.5, 11, 1],
    ]);
    // 12 at 1 RIR twice is on target twice: 7.5 kg, at 10 a side.
    const twice = sessions([5, straight(2, 12, 1)], [5, straight(2, 12, 1)]);
    expect(next(withBody, twice).sets.map((set) => [set.weight, set.reps])).toEqual([
      [7.5, 10],
      [7.5, 10],
    ]);
  });

  it("estimates the added load's maximum with the body on the curve, and off the number", () => {
    // Ten at 2 RIR with 5 kg: 68.75 kg moved twelve times to failure is about 96 kg once.
    const evidence = summarizeExerciseEvidence(withBody, sessions([5, straight(2, 10, 2)]));
    expect(evidence.observations[0]?.estimatedMax).toBeCloseTo(32.5, 1);
    expect(
      summarizeExerciseEvidence(splitSquat, sessions([5, straight(2, 10, 2)])).observations[0]
        ?.estimatedMax,
    ).toBeCloseTo(7, 1);
  });

  it("says what moves the load next, in one session or two, and where a step is a big jump", () => {
    // The seated leg curl: 2 × 10–15 at 1 RIR on a stack with 54, 59 and 64 kg stops.
    const legCurl: Prescription = {
      ...deadlift,
      sets: 2,
      repMin: 10,
      repMax: 15,
      rirMin: 1,
      rirMax: 1,
      ladder: { known: [54, 59, 64], stack: true, assisted: false },
    };
    expect(
      summarizeExerciseEvidence(
        legCurl,
        sessions([
          59,
          [
            [12, 1],
            [11, 1],
          ],
        ]),
      ).nextStep,
    ).toBe(
      "64 kg comes after one session with every working set at 15 reps and 2 RIR (or 16 reps at 1 RIR), or after two sessions running with every working set at 15 reps and 1 RIR.",
    );
    // A dumbbell RDL where the next dumbbell is 25 kg: 2 × 6–10 at 2 RIR.
    const rdl: Prescription = { ...deadlift, sets: 2, repMin: 6, repMax: 10, loadIncrement: 5 };
    // From 12 at 2 RIR, two past the top, 25 kg would start at about 3: too far below the range,
    // so reps stay at 12 and the step waits for the reserve there to grow (ADR 0047).
    expect(summarizeExerciseEvidence(rdl, sessions([20, straight(2, 12, 1)])).nextStep).toBe(
      "25 kg is too big a jump from 20 kg to bridge with reps: they stay at 12 here, and 25 kg comes once every working set has 17 reps in hand (12 reps at 5 RIR), or sooner with a smaller step or a variation.",
    );
    // A 10 to 12.5 kg curl on 10–15 at 1 RIR: 17 reps, two past the top, then 12.5 kg at about 7.
    const curl: Prescription = {
      ...deadlift,
      sets: 2,
      repMin: 10,
      repMax: 15,
      rirMin: 1,
      rirMax: 2,
    };
    expect(summarizeExerciseEvidence(curl, sessions([10, straight(2, 13, 1)])).nextStep).toBe(
      "12.5 kg is a big jump from 10 kg: reps build to 17 here, 2 past the top of the range and no further, and 12.5 kg comes after one session with every working set at 17 reps and 1 RIR. It starts below the range, at about 7 reps, and builds back up.",
    );
    // With the body on the curve, the split squat's next dumbbell is an ordinary step.
    expect(summarizeExerciseEvidence(withBody, sessions([5, straight(2, 11, 1)])).nextStep).toBe(
      "7.5 kg comes after one session with every working set at 12 reps and 2 RIR (or 13 reps at 1 RIR), or after two sessions running with every working set at 12 reps and 1 RIR.",
    );
  });
});

describe("a bounded coarse step, a lighter day and a heavier attempt (ADR 0047)", () => {
  // The incline curl: 2 × 10–15 at 1–2 RIR, 2.5 kg dumbbells.
  const curl: Prescription = {
    sets: 2,
    prescriptionType: "reps",
    repMin: 10,
    repMax: 15,
    durationMinSeconds: null,
    durationMaxSeconds: null,
    distanceMinMeters: null,
    distanceMaxMeters: null,
    rirMin: 1,
    rirMax: 2,
    rule: { kind: "double_progression", loadIncrement: 2.5 },
    loadIncrement: 2.5,
    unit: "kg",
  };
  // Upper B's incline bench: 3 × 4–6 at 2 RIR, 2.5 kg steps once all three reach 6.
  const incline: Prescription = {
    ...curl,
    sets: 3,
    repMin: 4,
    repMax: 6,
    rirMin: 2,
    rirMax: 2,
    rule: { kind: "conservative_strength", loadIncrement: 2.5, repsRequired: 6 },
  };
  /** One session per entry, newest first, a week apart: [load, reps, rir] per working set. */
  const sessions = (...entries: { sets: [number, number, number][]; planned?: number[] }[]) =>
    entries.map(({ sets, planned }, index) => ({
      workoutExerciseId: `e${index}`,
      workoutSessionId: `w${index}`,
      performedAt: new Date(Date.UTC(2026, 8, 28 - index * 7)),
      planned,
      sets: sets.map(([weight, reps, rir], setIndex) => ({
        setIndex: setIndex + 1,
        setType: "working" as const,
        weight,
        reps,
        rir,
        unit: "kg" as const,
        durationSeconds: null,
        distanceMeters: null,
      })),
    }));
  const same = (count: number, weight: number, reps: number, rir: number) =>
    Array.from({ length: count }, (): [number, number, number] => [weight, reps, rir]);

  it("caps the reps a coarse step builds past the top, and says where it lands", () => {
    // Landing 12.5 kg inside 10–15 needs 21 at 1 RIR; the curve is a guess that far out.
    expect(repCeiling(curl, 10, 12.5)).toBe(17);
    expect(landingFloor(curl, 10, 12.5)).toBe(5);
    // A step that lands inside the range from the top has no landing, and keeps the top.
    expect(repCeiling(curl, 40, 42.5)).toBe(15);
    expect(landingFloor(curl, 40, 42.5)).toBeNull();
    // A strength range never starts below itself.
    expect(landingFloor(incline, 55, 60)).toBeNull();
  });

  it("reads the sessions after a coarse step as reps building, not a step that failed", () => {
    const landed = summarizeExerciseEvidence(
      curl,
      sessions(
        { sets: same(2, 12.5, 7, 1) },
        { sets: same(2, 12.5, 6, 1) },
        { sets: same(2, 10, 17, 1) },
      ),
    );
    expect(landed).toMatchObject({
      readiness: "building",
      revert: null,
      landing: { load: 12.5, from: 10, floor: 5 },
    });
    // Under the floor the step was taken knowing about, it is out of reach after all.
    expect(
      summarizeExerciseEvidence(
        curl,
        sessions({ sets: same(2, 12.5, 3, 1) }, { sets: same(2, 10, 17, 1) }),
      ).revert,
    ).toMatchObject({ reason: "out_of_reach", load: 10 });
  });

  it("counts a near miss at a new load as one, not as a step that failed", () => {
    const nearMiss: [number, number, number][] = [
      [60, 6, 2],
      [60, 4, 1],
      [60, 4, 1],
    ];
    const missed: [number, number, number][] = [
      [60, 6, 0],
      [60, 3, 1],
    ];
    const evidence = summarizeExerciseEvidence(
      incline,
      sessions({ sets: nearMiss }, { sets: missed }, { sets: same(3, 55, 6, 2) }),
    );
    expect(evidence).toMatchObject({ readiness: "below", revert: null });
  });

  it("allows a longer set two reps of near miss, where the reported reserve is less sure", () => {
    // 3 × 12–20 at 1 RIR, stepped 10 to 11 kg: the bottom of the range is 13 in hand.
    const raise: Prescription = { ...curl, sets: 3, repMin: 12, repMax: 20, rirMin: 1, rirMax: 1 };
    const at = (reps: number, rir: number) =>
      sessions(
        { sets: same(3, 11, reps, rir) },
        { sets: same(3, 11, reps, rir) },
        { sets: same(3, 10, 21, 1) },
      );
    // 11 at 0 is two in hand short: past twelve reps a set, still a near miss.
    expect(summarizeExerciseEvidence(raise, at(11, 0)).revert).toBeNull();
    // 9 at 0 is four short, twice: the step goes back.
    expect(summarizeExerciseEvidence(raise, at(9, 0)).revert).toMatchObject({
      reason: "missed_twice",
      load: 10,
    });
  });

  it("reads a heavier set of the athlete's own at the session's load when it fell short", () => {
    // 28 Sep: the plan was 60 kg; 60 × 6 at 2, then 62.5 kg tried for sets 2–3 at 4 × 1 RIR.
    const tried = sessions(
      {
        sets: [
          [60, 6, 2],
          [62.5, 4, 1],
          [62.5, 4, 1],
        ],
        planned: [60],
      },
      {
        sets: [
          [60, 6, 0],
          [60, 3, 1],
        ],
        planned: [60],
      },
      { sets: same(3, 55, 6, 2) },
    );
    const evidence = summarizeExerciseEvidence(incline, tried);
    expect(evidence).toMatchObject({ readiness: "building", revert: null });
    expect(evidence.observations[0]?.capacity).toBeCloseTo(6.46, 1);
    expect(evidence.latestWorkLoads).toEqual([60, 60, 60]);
    // A pyramid the plan wrote keeps each step at its own load, and is read there.
    const pyramid = summarizeExerciseEvidence(
      incline,
      sessions({
        sets: [
          [60, 6, 3],
          [62.5, 6, 2],
          [65, 5, 2],
        ],
        planned: [60, 62.5, 65],
      }),
    );
    expect(pyramid.latestWorkLoads).toEqual([60, 62.5, 65]);
    expect(pyramid.observations[0]?.capacity).toBe(7);
    // A heavier set that held the range keeps its load too: the athlete stepped up mid-session.
    expect(
      summarizeExerciseEvidence(
        incline,
        sessions({
          sets: [
            [60, 6, 2],
            [62.5, 6, 2],
            [62.5, 6, 2],
          ],
        }),
      ).latestWorkLoads,
    ).toEqual([60, 62.5, 62.5]);
  });

  it("sets a single lighter session aside, and goes on from the load held before it", () => {
    const legExtension: Prescription = { ...curl, sets: 3, rirMin: 1, rirMax: 2 };
    const light = sessions(
      { sets: same(3, 40, 15, 3) },
      { sets: same(3, 50, 13, 2) },
      { sets: same(3, 50, 12, 2) },
    );
    const evidence = summarizeExerciseEvidence(legExtension, light);
    expect(evidence.setAside).toEqual([
      { sourceId: "workout:w0", date: "2026-09-28", load: 40, heldLoad: 50 },
    ]);
    expect(evidence.comparison.load).toBe(50);
    expect(evidence.observations.map((point) => point.load)).toEqual([50, 50]);
    expect(lighterSessions(legExtension, light).map((item) => item.sourceId)).toEqual([
      "workout:w0",
    ]);
    // Two lighter sessions running are the lighter load chosen.
    const chosen = summarizeExerciseEvidence(
      legExtension,
      sessions(
        { sets: same(3, 40, 15, 3) },
        { sets: same(3, 40, 15, 3) },
        { sets: same(3, 50, 13, 2) },
      ),
    );
    expect(chosen.setAside).toEqual([]);
    expect(chosen.comparison.load).toBe(40);
    // A lighter load the session's own plan asked for is the plan's, and is kept.
    const planned = summarizeExerciseEvidence(
      legExtension,
      sessions({ sets: same(3, 40, 15, 3), planned: [40] }, { sets: same(3, 50, 13, 2) }),
    );
    expect(planned.setAside).toEqual([]);
    // After a step that failed and went back, the load gone back to is not a lighter day.
    const back = summarizeExerciseEvidence(
      legExtension,
      sessions(
        { sets: same(3, 50, 13, 2) },
        { sets: same(3, 55, 7, 0) },
        { sets: same(3, 55, 7, 0) },
        { sets: same(3, 50, 15, 2) },
      ),
    );
    expect(back.setAside).toEqual([]);
  });
});
