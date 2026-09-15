import { describe, expect, it } from "vitest";

import { detectRecords } from "./records";
import {
  isComparable,
  MAX_SESSION_SECONDS,
  metricLabel,
  metricsForExercise,
  primaryMetric,
  runStats,
  sessionStats,
  type StatsSet,
  type StatsSlot,
  type StatsWorkout,
} from "./shared-stats";

const set = (over: Partial<StatsSet>): StatsSet => ({
  setType: "working",
  weight: null,
  unit: "kg",
  reps: null,
  durationSeconds: null,
  distanceMeters: null,
  ...over,
});

const bench: StatsSlot["exercise"] = {
  userId: null,
  loadPortability: "global",
  modality: "barbell",
  defaultPrescriptionType: "reps",
  primaryMuscles: ["chest"],
  secondaryMuscles: ["triceps", "front_delts"],
};
const pullUp: StatsSlot["exercise"] = {
  ...bench,
  modality: "bodyweight",
  primaryMuscles: ["lats"],
  secondaryMuscles: ["biceps"],
};
const legPress: StatsSlot["exercise"] = {
  ...bench,
  loadPortability: "equipment_specific",
  modality: "machine",
  primaryMuscles: ["quads"],
  secondaryMuscles: ["glutes"],
};
const plank: StatsSlot["exercise"] = {
  ...pullUp,
  defaultPrescriptionType: "duration",
  primaryMuscles: ["abs"],
  secondaryMuscles: [],
};

const workout = (exercises: StatsSlot[], over: Partial<StatsWorkout> = {}): StatsWorkout => ({
  id: "session-1",
  startedAt: new Date("2026-09-08T18:30:00+05:30"),
  completedAt: new Date("2026-09-08T19:35:00+05:30"),
  day: { name: "Upper A" },
  exercises,
  ...over,
});

describe("metricsForExercise", () => {
  it("follows the movement's measure and whether it is loaded (plan §3.9)", () => {
    expect(metricsForExercise(bench)).toEqual([
      "e1rm",
      "top_weight",
      "best_set_volume",
      "most_reps",
    ]);
    expect(metricsForExercise({ ...bench, modality: "dumbbell" })[0]).toBe("e1rm");
    expect(metricsForExercise(pullUp)).toEqual(["most_reps", "top_weight", "best_set_volume"]);
    expect(metricsForExercise(plank)).toEqual(["longest_hold", "top_weight"]);
    expect(metricsForExercise({ ...plank, defaultPrescriptionType: "distance" })).toEqual([
      "longest_carry",
      "top_weight",
    ]);
    expect(primaryMetric(legPress)).toBe("most_reps");
  });
  it("labels top weight by what the movement adds it to", () => {
    expect(metricLabel("top_weight", bench)).toBe("Top weight");
    expect(metricLabel("top_weight", pullUp)).toBe("Added load");
    expect(metricLabel("top_weight", plank)).toBe("Heaviest hold");
  });
  it("compares only global library movements", () => {
    expect(isComparable(bench)).toBe(true);
    expect(isComparable(legPress)).toBe(false);
    expect(isComparable({ ...bench, userId: "someone" })).toBe(false);
  });
});

describe("sessionStats", () => {
  it("computes the session and one row per library exercise, warm-ups excluded", () => {
    const { session, exercises } = sessionStats(
      workout([
        {
          exerciseId: "bench",
          exercise: bench,
          sets: [
            set({ setType: "warmup", weight: 40, reps: 10 }),
            set({ weight: 60, reps: 5 }),
            set({ weight: 62.5, reps: 4 }),
            set({ weight: 60, reps: 6, setType: "backoff" }),
          ],
        },
        {
          exerciseId: "pull-up",
          exercise: pullUp,
          sets: [set({ weight: 0, reps: 8 }), set({ weight: 5, reps: 6 })],
        },
        {
          exerciseId: "leg-press",
          exercise: legPress,
          sets: [set({ weight: 8, unit: "stack_index", reps: 12 })],
        },
      ]),
      "Asia/Kolkata",
    );
    expect(session).toMatchObject({
      sport: "workout",
      sourceId: "session-1",
      title: "Upper A",
      occurredOn: "2026-09-08",
      durationSeconds: 65 * 60,
      workingSets: 6,
      // 60×5 + 62.5×4 + 60×6 + 0×8 + 5×6; the stack set weighs nothing.
      volumeKg: 940,
      distanceMeters: null,
      paceSecondsPerKm: null,
    });
    // The body map's weighting: primaries in full, secondaries at half, no zeros stored.
    expect(session.muscleSets).toEqual({
      chest: 3,
      triceps: 1.5,
      front_delts: 1.5,
      lats: 2,
      biceps: 1,
      quads: 1,
      glutes: 0.5,
    });
    expect(exercises).toHaveLength(3);
    expect(exercises.find((e) => e.exerciseId === "bench")).toEqual({
      exerciseId: "bench",
      comparable: true,
      metrics: ["e1rm", "top_weight", "best_set_volume", "most_reps"],
      workingSets: 3,
      totalReps: 15,
      topWeightKg: 62.5,
      // One working set at 62.5, for 4.
      topWeightSets: 1,
      topWeightReps: 4,
      // Epley on 60 × 6, the best of the three working sets.
      bestE1rmKg: 72,
      bestSetVolumeKg: 360,
      mostReps: 6,
      longestDurationSeconds: null,
      longestDistanceMeters: null,
    });
    expect(exercises.find((e) => e.exerciseId === "pull-up")).toMatchObject({
      comparable: true,
      topWeightKg: 5,
      bestE1rmKg: null,
      mostReps: 8,
      totalReps: 14,
    });
    expect(exercises.find((e) => e.exerciseId === "leg-press")).toMatchObject({
      comparable: false,
      workingSets: 1,
      topWeightKg: null,
      bestSetVolumeKg: null,
      totalReps: 12,
    });
  });
  it("converts pounds, merges two slots of one movement and leaves a custom exercise out", () => {
    const { session, exercises } = sessionStats(
      workout(
        [
          {
            exerciseId: "bench",
            exercise: bench,
            sets: [set({ weight: 100, unit: "lb", reps: 5 })],
          },
          { exerciseId: "bench", exercise: bench, sets: [set({ weight: 50, reps: 3 })] },
          {
            exerciseId: "mine",
            exercise: { ...bench, userId: "alice" },
            sets: [set({ weight: 20, reps: 10 })],
          },
        ],
        { day: null },
      ),
      "UTC",
    );
    expect(session.title).toBe("Workout");
    expect(session.workingSets).toBe(3);
    expect(exercises).toHaveLength(1);
    // 100 lb is 45.36 kg, so the second slot's 50 kg is the top weight, worked once for 3.
    expect(exercises[0]).toMatchObject({
      workingSets: 2,
      topWeightKg: 50,
      topWeightSets: 1,
      topWeightReps: 3,
      totalReps: 8,
    });
    expect(exercises[0]!.bestSetVolumeKg).toBeCloseTo(226.8, 1);
    expect(session.volumeKg).toBeCloseTo(226.8 + 150 + 200, 1);
  });
  it("adds up the sets at the top weight across two slots, and lets a heavier slot replace them", () => {
    const twice = (kg: number) =>
      sessionStats(
        workout([
          {
            exerciseId: "bench",
            exercise: bench,
            sets: [set({ weight: 60, reps: 8 }), set({ weight: 60, reps: 6 })],
          },
          { exerciseId: "bench", exercise: bench, sets: [set({ weight: kg, reps: 3 })] },
        ]),
        "UTC",
      ).exercises[0]!;
    // The same load in both slots: three sets at 60, the best of them for 8.
    expect(twice(60)).toMatchObject({ topWeightKg: 60, topWeightSets: 3, topWeightReps: 8 });
    // A heavier second slot: the top weight is its one set, worked for 3.
    expect(twice(70)).toMatchObject({ topWeightKg: 70, topWeightSets: 1, topWeightReps: 3 });
  });
  it("caps a session left open at four hours and counts holds and carries", () => {
    const { session, exercises } = sessionStats(
      workout(
        [
          {
            exerciseId: "plank",
            exercise: plank,
            sets: [set({ durationSeconds: 45 }), set({ durationSeconds: 60, weight: 10 })],
          },
        ],
        { completedAt: new Date("2026-09-09T06:00:00+05:30") },
      ),
      "Asia/Kolkata",
    );
    expect(session.durationSeconds).toBe(MAX_SESSION_SECONDS);
    expect(exercises[0]).toMatchObject({ longestDurationSeconds: 60, topWeightKg: 10 });
  });
  it("refuses an unfinished workout", () => {
    expect(() => sessionStats(workout([], { completedAt: null }), "UTC")).toThrow();
  });
});

describe("runStats", () => {
  it("carries distance, time and pace on the run's civil date", () => {
    expect(
      runStats(
        {
          id: "run-1",
          startedAt: new Date("2026-09-08T23:30:00Z"),
          durationSeconds: 1690,
          distanceMeters: 5200,
        },
        "Asia/Kolkata",
      ),
    ).toEqual({
      sport: "run",
      sourceId: "run-1",
      title: "Run",
      occurredOn: "2026-09-09",
      startedAt: new Date("2026-09-08T23:30:00Z"),
      durationSeconds: 1690,
      workingSets: 0,
      volumeKg: 0,
      distanceMeters: 5200,
      paceSecondsPerKm: 325,
      muscleSets: {},
    });
  });
});

describe("detectRecords", () => {
  const stats = sessionStats(
    workout([
      { exerciseId: "bench", exercise: bench, sets: [set({ weight: 70, reps: 5 })] },
      { exerciseId: "pull-up", exercise: pullUp, sets: [set({ weight: 0, reps: 10 })] },
      {
        exerciseId: "leg-press",
        exercise: legPress,
        sets: [set({ weight: 100, reps: 12 })],
      },
    ]),
    "UTC",
  ).exercises;

  it("announces strict improvements per metric, and only those", () => {
    const previous = new Map([
      ["bench", { e1rm: 80, top_weight: 70, best_set_volume: 300, most_reps: 8 }],
      ["pull-up", { most_reps: 10, top_weight: 0 }],
    ]);
    expect(detectRecords(previous, stats)).toEqual([
      // 70 × (1 + 5/30) = 81.7 beats 80; top weight ties at 70; 350 beats 300; 5 reps does not beat 8.
      { exerciseId: "bench", metric: "e1rm", value: 81.7, previous: 80 },
      { exerciseId: "bench", metric: "best_set_volume", value: 350, previous: 300 },
    ]);
  });
  it("never announces a first performance, nor a machine's number", () => {
    expect(detectRecords(new Map(), stats)).toEqual([]);
    const previous = new Map([["leg-press", { most_reps: 5, top_weight: 50 }]]);
    expect(detectRecords(previous, stats)).toEqual([]);
  });
  it("ignores a metric the movement is not measured by", () => {
    const previous = new Map([["pull-up", { e1rm: 1, longest_hold: 1, most_reps: 12 }]]);
    expect(detectRecords(previous, stats)).toEqual([]);
  });
});
