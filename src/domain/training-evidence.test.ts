import { describe, expect, it } from "vitest";
import { median, summarizeExerciseEvidence, type EvidencePerformance } from "./training-evidence";
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
    const below: [number, number][] = [
      [3, 2],
      [3, 2],
      [2, 2],
      [2, 2],
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
