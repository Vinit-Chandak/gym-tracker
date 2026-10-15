import { describe, expect, it } from "vitest";

import type { CoachingChangeRecord } from "@/db/schema";
import type { ComparablePerformance } from "@/server/queries/comparable";
import { applyRule, prescriptionFor, type RuleInput } from "./progression-rule";

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
    // 2 at 1 RIR is 3 in hand against the 5 that 3 at 2 RIR needs: clearly short, twice.
    const missed = rule({
      changes: [raised],
      history: [session(2, 100, 2, 1), session(6, 100, 2, 1), session(12, 97.5, 5, 3)],
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

describe("what the workout screen asks for next (ADR 0040)", () => {
  /** One session with a set per [weight, reps, rir], `daysAgo` days before `asOf`. */
  const logged = (daysAgo: number, sets: [number, number, number][]): ComparablePerformance => ({
    ...session(daysAgo, 0, 0, 0),
    sets: sets.map(([weight, reps, rir], index) => ({
      setIndex: index + 1,
      setType: "working" as const,
      weight,
      unit: "kg" as const,
      reps,
      rir,
      durationSeconds: null,
      distanceMeters: null,
    })),
  });

  it("goes back from a heavy single to the last load held in the range, not up to three reps", () => {
    // Deadlift, 3 × 3–5 at 2–3 RIR: 120 × 3 at 2 RIR held; a 125 kg single at 0 RIR since.
    const deadlift = rule({
      planned: { ...bench, rirMax: 3 },
      exerciseSlug: "deadlift",
      history: [
        logged(7, [[125, 1, 0]]),
        logged(14, [
          [120, 3, 2],
          [120, 3, 2],
          [120, 3, 2],
        ]),
      ],
    });
    expect(deadlift.suggestion).toMatchObject({
      kind: "revert",
      reason: "125 kg had 1 rep in hand, short of the 3-rep minimum: back to 120 kg.",
    });
    expect(deadlift.suggestion?.sets.map((set) => [set.weight, set.reps, set.rir])).toEqual([
      [120, 3, 2],
    ]);
  });

  it("steps a split squat's dumbbell once the body under it is counted", () => {
    // 2 × 8–12 a side at 1–2 RIR; 12 a side at 2 RIR with a 5 kg dumbbell.
    const splitSquat = {
      planned: { ...bench, sets: 2, repMin: 8, repMax: 12, rirMin: 1, rirMax: 2 },
      exerciseSlug: "split-squat",
      history: [
        logged(7, [
          [5, 12, 2],
          [5, 12, 2],
        ]),
      ],
    };
    const counted = rule({
      ...splitSquat,
      exercise: { ...exercise, modality: "bodyweight", movementPattern: "lunge" },
      bodyWeightKg: 75,
    });
    expect(counted.suggestion?.kind).toBe("increase");
    expect(counted.suggestion?.sets.map((set) => [set.weight, set.reps, set.rir])).toEqual([
      [7.5, 11, 1],
      [7.5, 11, 1],
    ]);
    // Without a recorded weight the stand-in does the same job.
    expect(
      rule({
        ...splitSquat,
        exercise: { ...exercise, modality: "bodyweight", movementPattern: "lunge" },
      }).suggestion?.kind,
    ).toBe("increase");
    // Read against the dumbbell alone, 7.5 kg looked half as heavy again: too big to bridge with
    // reps, which build two past the top and no further (ADR 0048).
    expect(rule(splitSquat).suggestion).toMatchObject({
      kind: "hold",
      advice:
        "Build to 14 reps here and no further: the step comes once every set has more in reserve there, or sooner with a smaller step or a variation.",
    });
  });
});

describe("pounds", () => {
  /** The same performance logged in pounds. */
  const inPounds = (performance: ComparablePerformance): ComparablePerformance => ({
    ...performance,
    sets: performance.sets.map((set) => ({ ...set, unit: "lb" as const })),
  });

  it("steps a pound lifter by the plate jump, never by 2.5 kg converted", () => {
    const outcome = rule({
      preferredUnit: "lb",
      history: [inPounds(session(2, 140, 5, 2)), inPounds(session(5, 140, 5, 2))],
    });
    expect(outcome.weightStep).toBe(5);
    expect(outcome.suggestion?.kind).toBe("increase");
    expect(weights(outcome)).toEqual([145, 145, 145]);
  });

  it("steps registered pound dumbbells and bars by the plate jump too", () => {
    // Onboarding registers a pound lifter's dumbbells and bar in pounds, without an increment.
    const dumbbells = rule({
      exercise: { ...exercise, defaultLoadIncrement: 2, modality: "dumbbell" },
      planned: { ...bench, repMin: 8, repMax: 12, rirMin: 1, rirMax: 2, loadIncrement: null },
      preferredUnit: "lb",
      equipment: { id: "dumbbells", unit: "lb", loadIncrement: null },
      history: [inPounds(session(3, 50, 12, 3, "dumbbells"))],
    });
    expect(dumbbells.weightStep).toBe(5);
    expect(weights(dumbbells)).toEqual([55, 55, 55]);
    // The programme's own 2.5 kg increment is a 5 lb jump on a registered bar as well.
    const bar = rule({
      preferredUnit: "lb",
      equipment: { id: "bar", unit: "lb", loadIncrement: null },
      history: [inPounds(session(3, 135, 5, 3, "bar"))],
    });
    expect(weights(bar)).toEqual([140, 140, 140]);
    // A machine's own increment is already in its unit.
    const typed = rule({
      preferredUnit: "lb",
      equipment: { id: "bar", unit: "lb", loadIncrement: 2.5 },
      planned: { ...bench, loadIncrement: null },
      history: [inPounds(session(3, 135, 5, 3, "bar"))],
    });
    expect(weights(typed)).toEqual([137.5, 137.5, 137.5]);
  });

  it("reads kilograms in pounds as a load that can be put on the bar", () => {
    // 100 kg is 220.46 lb: the plates make 220, and the step from there is 225.
    const stepped = rule({ preferredUnit: "lb", history: [session(3, 100, 5, 3)] });
    expect(weights(stepped)).toEqual([225, 225, 225]);
    const held = rule({ preferredUnit: "lb", history: [session(3, 100, 5, 2)] });
    expect(held.suggestion?.kind).toBe("hold");
    expect(weights(held)).toEqual([220, 220, 220]);
    expect(held.previous?.sets.map((set) => [set.weight, set.unit])).toEqual([
      [220, "lb"],
      [220, "lb"],
      [220, "lb"],
    ]);
    // Where the equipment lists its loads, the nearest of them.
    const listed = rule({
      preferredUnit: "lb",
      equipment: { id: "bar", unit: "lb", loadIncrement: 5 },
      ladder: { known: [215, 225, 235], stack: false, assisted: false, increment: 5 },
      history: [session(3, 100, 5, 2)],
    });
    expect(weights(listed)).toEqual([225, 225, 225]);
  });
});

describe("free weights and bodyweight are the same lift at any gym (ADR 0006 §5)", () => {
  const homeBar = { id: "home-bar", unit: "kg" as const, loadIncrement: null };

  it("reads a bar's history at another gym, on another bar or on none registered", () => {
    const history = [session(3, 100, 5, 3, "home-bar"), session(7, 100, 5, 3, "home-bar")];
    for (const equipment of [null, { ...homeBar, id: "gym-bar" }]) {
      const outcome = rule({ equipment, history });
      expect(outcome.basis).toBe("exercise");
      expect(outcome.previous?.workoutSessionId).toBe("s3");
      expect(outcome.suggestion?.kind).toBe("increase");
      expect(weights(outcome)).toEqual([102.5, 102.5, 102.5]);
    }
  });

  it("goes on from the newest session wherever it was done", () => {
    // At home today, after a session at the gym on a bar nobody registered.
    const outcome = rule({
      equipment: homeBar,
      history: [session(2, 102.5, 5, 2), session(5, 100, 5, 3, "home-bar")],
    });
    expect(outcome.basisPerformance?.workoutSessionId).toBe("s2");
    expect(outcome.suggestion?.kind).toBe("hold");
    expect(weights(outcome)).toEqual([102.5, 102.5, 102.5]);
  });

  it("starts from a coach's change made on another bar", () => {
    const outcome = rule({
      changes: [
        decision(1, {
          kind: "progression",
          equipmentId: "home-bar",
          before: { loads: loads(100) },
          after: { loads: loads(102.5) },
        }),
      ],
      history: [session(3, 100, 5, 2, "home-bar")],
    });
    expect(outcome.suggestion?.reason).toMatch(/last accepted change/);
    expect(weights(outcome)).toEqual([102.5, 102.5, 102.5]);
  });

  it("keeps a machine's history to that machine", () => {
    const machine = {
      exercise: { ...exercise, loadPortability: "equipment_specific" as const },
      equipment: { id: "press-a", unit: "kg" as const, loadIncrement: 5 },
    };
    const outcome = rule({ ...machine, history: [session(3, 60, 5, 3, "press-b")] });
    expect(outcome.basis).toBe("none");
    expect(outcome.suggestion?.kind).toBe("start");
  });
});

describe("bodyweight sets saved without a load", () => {
  // Pull-ups, 3 × 6–10 at 1–2 RIR; the logger saves an untouched "kg added" as nothing.
  const pullUp = {
    planned: { ...bench, repMin: 6, repMax: 10, rirMin: 1, rirMax: 2 },
    exerciseSlug: "pull-up",
    exercise: { ...exercise, modality: "bodyweight", movementPattern: "vertical_pull" },
  };
  const unloaded = (daysAgo: number, reps: number, rir: number): ComparablePerformance => {
    const performance = session(daysAgo, 0, reps, rir);
    return { ...performance, sets: performance.sets.map((set) => ({ ...set, weight: null })) };
  };

  it("builds reps on the body alone, as it does on a logged 0", () => {
    const history = [2, 5, 9, 12].map((daysAgo) => unloaded(daysAgo, 7, 3));
    const outcome = rule({ ...pullUp, history });
    expect(outcome.suggestion?.kind).toBe("hold");
    expect(outcome.suggestion?.sets.map((set) => [set.weight, set.reps, set.rir])).toEqual([
      [0, 9, 1],
      [0, 9, 1],
      [0, 9, 1],
    ]);
    // What the athlete is shown as last time stays as it was logged.
    expect(outcome.previous?.sets[0]?.weight).toBeNull();
  });

  it("says a rep to spare at the top needs a load to add, not a second confirmation", () => {
    const outcome = rule({ ...pullUp, history: [unloaded(2, 10, 2), unloaded(5, 10, 2)] });
    expect(outcome.suggestion).toMatchObject({
      kind: "hold",
      reason: "Every set had a rep to spare at the top of the range.",
      advice: expect.stringMatching(/^Bodyweight has no next weight here/),
    });
  });

  it("leaves an unweighed barbell set unknown", () => {
    const unweighed = session(3, 0, 5, 3);
    const outcome = rule({
      history: [{ ...unweighed, sets: unweighed.sets.map((set) => ({ ...set, weight: null })) }],
    });
    expect(weights(outcome)).toEqual([null, null, null]);
  });
});

describe("back after a break (owner decision)", () => {
  it("brings the last session back about a tenth lighter, on a load that exists", () => {
    const outcome = rule({ history: [session(60, 100, 5, 2)] });
    expect(outcome).toMatchObject({ basis: "exercise", previous: { workoutSessionId: "s60" } });
    expect(outcome.suggestion).toMatchObject({
      kind: "resume",
      reason: "Not done for over 8 weeks: last time's sets, about 10% lighter.",
    });
    expect(weights(outcome)).toEqual([90, 90, 90]);
  });

  it("reads a machine's old session as its own, never as another machine's guess", () => {
    const history = [session(60, 140, 10, 2, "leg-press"), session(64, 140, 10, 2, "leg-press")];
    const outcome = rule({
      exercise: { ...exercise, loadPortability: "equipment_specific" },
      equipment: { id: "leg-press", unit: "kg", loadIncrement: 5 },
      planned: { ...bench, repMin: 8, repMax: 12, loadIncrement: null },
      history,
      elsewhere: history[0]!,
    });
    expect(outcome.basis).toBe("same_equipment");
    expect(outcome.suggestion?.kind).toBe("resume");
    expect(weights(outcome)).toEqual([125, 125, 125]);
  });

  it("goes on as usual from the first session back", () => {
    const outcome = rule({ history: [session(3, 90, 5, 3), session(63, 100, 5, 2)] });
    expect(outcome.suggestion?.kind).toBe("increase");
    expect(weights(outcome)).toEqual([92.5, 92.5, 92.5]);
  });
});

describe("an exercise added on the spot", () => {
  it("takes the library's range, and a half-rep RIR as the two whole reps it sits between", () => {
    const curl = { ...exercise, defaultRepMin: 10, defaultRepMax: 15, defaultRir: 1.5 };
    expect(prescriptionFor(null, curl, null, 2.5, "kg")).toMatchObject({
      repMin: 10,
      repMax: 15,
      rirMin: 1,
      rirMax: 2,
    });
    expect(prescriptionFor(null, { ...curl, defaultRir: 2 }, null, 2.5, "kg")).toMatchObject({
      rirMin: 2,
      rirMax: 2,
    });
  });

  it("goes on from the load held before a lighter session, not from the lighter one (ADR 0048)", () => {
    // 3 × 3–5 at 2 RIR: 100 × 5 at 2 twice, then one lighter day at 80 × 5 at 4.
    const outcome = rule({
      history: [session(2, 80, 5, 4), session(5, 100, 5, 2), session(9, 100, 5, 2)],
    });
    expect(outcome.basisPerformance?.workoutSessionId).toBe("s5");
    // On target twice at 100: the step is from 100, never from the lighter day.
    expect(outcome.suggestion?.kind).toBe("increase");
    expect(weights(outcome)).toEqual([102.5, 102.5, 102.5]);
    // The lighter load chosen twice running is the load now.
    const chosen = rule({
      history: [session(2, 80, 5, 4), session(4, 80, 5, 4), session(9, 100, 5, 2)],
    });
    expect(chosen.basisPerformance?.workoutSessionId).toBe("s2");
  });
});
