import { describe, expect, it } from "vitest";

import type { CoachingChangeRecord } from "@/db/schema";
import type { ComparablePerformance } from "@/server/queries/comparable";
import { applyRule, type RuleInput } from "./progression-rule";

const asOf = new Date("2026-09-27T12:00:00Z");
const DAY = 86_400_000;

/** A bench slot: 3 × 3–5 at 2 RIR, 2.5 kg steps. */
const bench: NonNullable<RuleInput["planned"]> = {
  sets: 3,
  prescriptionType: "reps",
  repMin: 3,
  repMax: 5,
  durationMinSeconds: null,
  durationMaxSeconds: null,
  distanceMinMeters: null,
  distanceMaxMeters: null,
  rirMin: 2,
  rirMax: 2,
  progressionRule: { kind: "double_progression", loadIncrement: null },
  loadIncrement: 2.5,
};
const exercise: RuleInput["exercise"] = {
  loadPortability: "global",
  defaultLoadIncrement: 2.5,
  defaultPrescriptionType: "reps",
  defaultRepMin: 3,
  defaultRepMax: 5,
  defaultDurationMinSeconds: null,
  defaultDurationMaxSeconds: null,
  defaultDistanceMinMeters: null,
  defaultDistanceMaxMeters: null,
  defaultRir: 2,
};

/** Three straight sets, `daysAgo` days before `asOf`, for the bench slot. */
const session = (
  daysAgo: number,
  weight: number,
  reps: number,
  rir: number,
  equipmentInstanceId: string | null = null,
): ComparablePerformance => ({
  workoutExerciseId: `exercise-${daysAgo}`,
  workoutSessionId: `s${daysAgo}`,
  plannedProgramExerciseId: "slot",
  plannedSlotLineageId: "bench-slot",
  gymId: "gym",
  gymName: "Gym",
  equipmentInstanceId,
  equipmentInstanceName: null,
  performedAt: new Date(asOf.getTime() - daysAgo * DAY),
  sets: [1, 2, 3].map((setIndex) => ({
    setIndex,
    setType: "working" as const,
    weight,
    unit: "kg" as const,
    reps,
    rir,
    durationSeconds: null,
    distanceMeters: null,
  })),
});
const loads = (load: number) => [0, 1, 2].map((index) => ({ index, load }));
const decision = (
  daysAgo: number,
  change: Pick<CoachingChangeRecord, "kind"> & Partial<CoachingChangeRecord>,
): NonNullable<RuleInput["changes"]>[number] => ({
  createdAt: new Date(asOf.getTime() - daysAgo * DAY),
  changes: [
    {
      scope: "slot:bench-slot",
      evidenceIds: [],
      unit: "kg",
      exerciseSlug: "bench-press",
      equipmentId: null,
      before: {},
      after: {},
      ...change,
    },
  ],
});
const rule = (input: Partial<RuleInput>) =>
  applyRule({
    asOf,
    planned: bench,
    exerciseSlug: "bench-press",
    exercise,
    equipment: null,
    slotLineageId: "bench-slot",
    timeZone: "UTC",
    history: [],
    elsewhere: null,
    ...input,
  });
const weights = (outcome: ReturnType<typeof applyRule>) =>
  outcome.suggestion?.sets.map((set) => set.weight);

describe("applyRule after an accepted change (ADR 0039)", () => {
  const raised = decision(10, {
    kind: "progression",
    evidenceIds: ["workout:s12"],
    before: { loads: loads(97.5) },
    after: { loads: loads(100) },
  });

  it("starts the next session from the loads a change set, and then goes on from what was done", () => {
    const next = rule({ changes: [raised], history: [session(12, 97.5, 5, 3)] });
    expect(next.suggestion).toMatchObject({
      kind: "hold",
      reason: expect.stringMatching(/last accepted change/),
    });
    expect(weights(next)).toEqual([100, 100, 100]);
    // The athlete trained 100, the rule stepped to 102.5, and they trained that: 102.5 stays.
    const later = rule({
      changes: [raised],
      history: [session(2, 102.5, 5, 2), session(5, 100, 5, 3), session(12, 97.5, 5, 3)],
    });
    expect(later.suggestion?.reason).toMatch(/On target/);
    expect(weights(later)).toEqual([102.5, 102.5, 102.5]);
  });

  it("goes back to the load before a step that did not hold, across the change that made it", () => {
    const missed = rule({
      changes: [raised],
      history: [session(2, 100, 2, 2), session(6, 100, 2, 2), session(12, 97.5, 5, 3)],
    });
    expect(missed.suggestion?.kind).toBe("revert");
    expect(weights(missed)).toEqual([97.5, 97.5, 97.5]);
  });

  it("returns to the baseline once after a temporary session, then progresses from it", () => {
    const lighter = decision(6, {
      kind: "temporary",
      before: { loads: loads(100) },
      after: { loads: loads(90) },
    });
    const after = rule({
      changes: [lighter],
      history: [session(5, 90, 5, 4), session(8, 100, 5, 2)],
    });
    expect(after.suggestion?.reason).toMatch(/retained baseline/);
    expect(weights(after)).toEqual([100, 100, 100]);
    const back = rule({
      changes: [lighter],
      history: [session(2, 100, 5, 3), session(5, 90, 5, 4), session(8, 100, 5, 2)],
    });
    expect(back.suggestion?.kind).toBe("increase");
    expect(weights(back)).toEqual([102.5, 102.5, 102.5]);
  });

  it("never steps twice on the session a change was made on", () => {
    const earned = rule({
      changes: [decision(1, { kind: "progression", evidenceIds: ["workout:s2"] })],
      history: [session(2, 100, 5, 3)],
    });
    expect(earned.suggestion?.kind).toBe("hold");
    expect(weights(earned)).toEqual([100, 100, 100]);
  });
});

describe("the 14-day brake", () => {
  // A leg curl stack whose stops are a sixth of the load apart.
  const stack = {
    equipment: { id: "stack", unit: "kg" as const, loadIncrement: null },
    ladder: { known: [30, 35, 40], stack: true, assisted: false, increment: null },
    exercise: { ...exercise, loadPortability: "equipment_specific" as const },
    planned: { ...bench, repMin: 8, repMax: 12, loadIncrement: null },
  };

  it("lets two earned steps through where one step is already past 10%", () => {
    const outcome = rule({
      ...stack,
      history: [session(3, 35, 14, 2, "stack"), session(7, 30, 15, 2, "stack")],
    });
    expect(outcome.suggestion?.kind).toBe("increase");
    expect(weights(outcome)).toEqual([40, 40, 40]);
  });

  it("holds a third step inside the window for review", () => {
    const outcome = rule({
      ...stack,
      history: [
        session(1, 40, 14, 2, "stack"),
        session(3, 35, 14, 2, "stack"),
        session(7, 30, 15, 2, "stack"),
      ],
    });
    expect(outcome.suggestion).toMatchObject({
      kind: "hold",
      reason: expect.stringMatching(/14 days/),
    });
    expect(weights(outcome)).toEqual([40, 40, 40]);
  });
});
