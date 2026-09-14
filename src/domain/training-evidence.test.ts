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
    const legacy = history([12, 12]);
    legacy.forEach((item) => {
      item.sets = item.sets.map((set) => ({ ...set, effortReported: false }));
    });
    expect(summarizeExerciseEvidence(p, legacy)).toMatchObject({
      progressionReady: false,
      effortCoverage: { known: 0, total: 2 },
    });
    expect(legacy[0]!.sets[0]!.rir).toBe(2);
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
  it("uses feasible home increments and holds jumps beyond the automatic cap", () => {
    const two = history([12, 12]);
    const home = { ...p, requireConfirmedLoads: true, availableLoads: [50, 52, 55] };
    expect(suggestNext(home, two[0]!.sets, "exercise", two).sets[0]?.weight).toBe(52);
    expect(
      suggestNext({ ...home, availableLoads: [50, 55] }, two[0]!.sets, "exercise", two).kind,
    ).toBe("hold");
    expect(suggestNext({ ...home, availableLoads: [] }, two[0]!.sets, "exercise", two).kind).toBe(
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
