import { describe, expect, it } from "vitest";

import { presetRange } from "./graph-range";
import {
  averagePace,
  exerciseSessions,
  foodGraph,
  groupShares,
  measuresWithData,
  recoveryDays,
  recoveryGraph,
  runningGraph,
  strengthGraph,
  type ExerciseSetRow,
  type StrengthRow,
} from "./progress-graphs";
import type { RecoveryReading } from "./recovery";

const TODAY = "2026-10-07";
const MONTH = presetRange("1m", TODAY); // 8 Sept – 7 Oct, by day
const QUARTER = presetRange("3m", TODAY); // from Mon 6 Jul, by week

describe("working sets by muscle group", () => {
  it("counts a set once per group, never once per muscle", () => {
    // A squat: quads and glutes primary, hamstrings, adductors and lower back secondary.
    expect(groupShares(["quads", "glutes"], ["hamstrings", "adductors", "lower_back"])).toEqual({
      legs: 1,
      back: 0.5,
    });
    // A bench press: the chest in full, the front delts and triceps at half.
    expect(groupShares(["chest"], ["front_delts", "triceps"])).toEqual({
      chest: 1,
      shoulders: 0.5,
      arms: 0.5,
    });
    // A muscle named both ways counts as primary; one the app no longer knows is ignored.
    expect(groupShares(["lats"], ["lats", "biceps", "gills"])).toEqual({ back: 1, arms: 0.5 });
  });

  const rows: StrengthRow[] = [
    {
      sessionId: "a",
      date: "2026-09-14",
      primaryMuscles: ["quads", "glutes"],
      secondaryMuscles: ["hamstrings"],
      workingSets: 4,
    },
    {
      sessionId: "a",
      date: "2026-09-14",
      primaryMuscles: ["chest"],
      secondaryMuscles: ["triceps"],
      workingSets: 3,
    },
    {
      sessionId: "b",
      date: "2026-09-16",
      primaryMuscles: ["lats"],
      secondaryMuscles: ["biceps"],
      workingSets: 4,
    },
    {
      sessionId: "c",
      date: "2026-09-30",
      primaryMuscles: ["quads"],
      secondaryMuscles: [],
      workingSets: 5,
    },
    // Outside the month: left out.
    {
      sessionId: "z",
      date: "2026-08-01",
      primaryMuscles: ["quads"],
      secondaryMuscles: [],
      workingSets: 9,
    },
  ];

  it("totals each group, every set once under All", () => {
    const graph = strengthGraph(rows, MONTH, TODAY);
    expect(graph.totals).toEqual({
      all: 16,
      legs: 9,
      chest: 3,
      arms: 3.5,
      back: 4,
      shoulders: 0,
      core: 0,
    });
    expect(graph.workouts).toMatchObject({ all: 3, legs: 2, chest: 1, back: 1, arms: 2 });
    // The weekly average is taken over the weeks trained (two), not the month's five.
    expect(graph.weeksTrained).toBe(2);
  });

  it("puts each day's sets in its slot, and names the slot's one workout", () => {
    const graph = strengthGraph(rows, MONTH, TODAY);
    expect(graph.buckets).toHaveLength(30);
    const day = graph.buckets.find((bucket) => bucket.start === "2026-09-14")!;
    expect(day.sets.all).toBe(7);
    expect(day.workouts.all).toBe(1);
    expect(day.sessionId).toMatchObject({ all: "a", legs: "a", chest: "a" });
    expect(day.sessionId.back).toBeUndefined();
    const weekly = strengthGraph(rows, QUARTER, TODAY).buckets.find(
      (bucket) => bucket.start === "2026-09-14",
    )!;
    // Two workouts in the week: no single one to open.
    expect(weekly).toMatchObject({ sets: { all: 11 }, workouts: { all: 2 } });
    expect(weekly.sessionId.all).toBeUndefined();
    expect(weekly.sessionId.chest).toBe("a");
  });
});

describe("one exercise, workout by workout", () => {
  const set = (sessionId: string, weight: number | null, reps: number | null): ExerciseSetRow => ({
    sessionId,
    date: sessionId === "a" ? "2026-09-14" : "2026-09-21",
    weight,
    reps,
    durationSeconds: null,
    distanceMeters: null,
  });

  it("takes each workout's best by every measure, and the set behind it", () => {
    const [first, second] = exerciseSessions(
      [set("a", 100, 5), set("a", 100, 6), set("a", 80, 10), set("b", 105, 3)],
      "barbell",
      "kg",
    );
    expect(first).toMatchObject({
      sessionId: "a",
      maxWeight: 100,
      maxWeightReps: 6,
      maxReps: 10,
      maxRepsWeight: 80,
      maxVolume: 800,
      maxVolumeSet: { weight: 80, reps: 10 },
      e1rm: 120,
      e1rmSet: { weight: 100, reps: 6 },
    });
    expect(second).toMatchObject({ maxWeight: 105, e1rm: 115.5 });
  });

  it("gives a bodyweight set reps and nothing else, and a machine no estimated 1RM", () => {
    const [pullUps] = exerciseSessions([set("a", 0, 12), set("a", null, 10)], "bodyweight", "kg");
    expect(pullUps).toMatchObject({ maxReps: 12, maxWeight: null, maxVolume: null, e1rm: null });
    expect(measuresWithData([pullUps!])).toEqual(["maxReps"]);
    const [stack] = exerciseSessions([set("a", 12, 10)], "machine", "stack_index");
    expect(stack!.e1rm).toBeNull();
    expect(measuresWithData([stack!])).toEqual(["maxWeight", "maxReps", "maxVolume"]);
  });
});

describe("running", () => {
  const runs = [
    { id: "r1", date: "2026-09-10", environment: "outdoor" as const, metres: 5000, seconds: 1800 },
    { id: "r2", date: "2026-09-10", environment: "outdoor" as const, metres: 3000, seconds: 1200 },
    {
      id: "r3",
      date: "2026-09-20",
      environment: "treadmill" as const,
      metres: 4000,
      seconds: 1440,
    },
    { id: "r4", date: "2026-09-22", environment: "outdoor" as const, metres: 0, seconds: 600 },
  ];

  it("totals each bucket and names its one run, if it has one", () => {
    const graph = runningGraph(runs, MONTH, TODAY);
    expect(graph.totals).toEqual({ metres: 12000, seconds: 5040, runs: 4 });
    const twice = graph.buckets.find((bucket) => bucket.start === "2026-09-10")!;
    expect(twice).toMatchObject({ metres: 8000, runs: 2, runId: null });
    expect(graph.buckets.find((bucket) => bucket.start === "2026-09-20")!.runId).toBe("r3");
    // A run without a distance has no pace, rather than an infinitely slow one.
    expect(graph.points.find((point) => point.id === "r4")!.pace).toBeNull();
  });

  it("averages pace over every kilometre, a run without a distance left out", () => {
    // 8 km in 3,000 s: 375 s a kilometre, not the mean of 360 and 400.
    expect(averagePace(runningGraph(runs.slice(0, 2), MONTH, TODAY).points)).toBe(375);
    expect(averagePace([{ metres: 0, seconds: 600 }])).toBeNull();
  });
});

describe("food", () => {
  it("averages over the days something was logged, never counting a blank day as zero", () => {
    const graph = foodGraph(
      [
        { date: "2026-09-20", kcal: 2000, protein: 120 },
        { date: "2026-09-21", kcal: 2400, protein: 0 },
        // A day logged in part still counts: 300 kcal is what was recorded.
        { date: "2026-09-22", kcal: 300, protein: 20 },
        // Logged, but adding up to nothing (water): not a day of eating.
        { date: "2026-09-23", kcal: 0, protein: 0 },
      ],
      MONTH,
      TODAY,
    );
    expect(graph.kcal).toEqual({ mean: 1566.7, days: 3 });
    // A day whose foods name no protein is unknown for protein, not zero.
    expect(graph.protein).toEqual({ mean: 70, days: 2 });
    expect(graph.days).toBe(30);
    expect(graph.buckets.find((bucket) => bucket.start === "2026-09-23")!.kcal).toBeNull();
  });

  it("averages a week over its logged days, and opens its last one", () => {
    const graph = foodGraph(
      [
        { date: "2026-09-14", kcal: 2000, protein: 100 },
        { date: "2026-09-16", kcal: 2600, protein: 140 },
      ],
      QUARTER,
      TODAY,
    );
    const week = graph.buckets.find((bucket) => bucket.start === "2026-09-14")!;
    expect(week).toMatchObject({ kcal: 2300, kcalDays: 2, protein: 120, lastDay: "2026-09-16" });
  });
});

describe("recovery", () => {
  const reading = (
    id: string,
    date: string,
    values: Partial<RecoveryReading>,
    sessionId: string | null = id,
  ): RecoveryReading => ({
    id,
    date,
    recordedAt: `${date}T18:00:00.000Z`,
    source: sessionId ? "workout" : "daily",
    sessionId,
    sleepHours: null,
    sleepQuality: null,
    energy: null,
    fatigue: null,
    soreness: null,
    ...values,
  });

  it("makes a day checked in twice one day, a blank answer left out of it", () => {
    const [day] = recoveryDays([
      reading("a", "2026-09-14", { sleepHours: 6, fatigue: 2 }),
      reading("b", "2026-09-14", { sleepHours: 8, fatigue: null }),
    ]);
    expect(day).toEqual({
      date: "2026-09-14",
      values: { sleepHours: 7, sleepQuality: null, fatigue: 2, soreness: null },
      readings: 2,
      sessionIds: ["a", "b"],
    });
  });

  it("averages over days, so a day trained twice does not weigh twice", () => {
    const graph = recoveryGraph(
      [
        reading("a", "2026-09-14", { sleepHours: 6 }),
        reading("b", "2026-09-14", { sleepHours: 6 }),
        reading("c", "2026-09-15", { sleepHours: 9 }),
        // Zero hours is an answer, and is kept.
        reading("d", "2026-09-16", { sleepHours: 0 }),
      ],
      MONTH,
      TODAY,
    );
    expect(graph.summary.sleepHours).toEqual({ mean: 5, days: 3 });
    expect(graph.summary.fatigue).toEqual({ mean: null, days: 0 });
    expect(graph.checkIns).toBe(4);
    const twice = graph.buckets.find((bucket) => bucket.start === "2026-09-14")!;
    expect(twice).toMatchObject({ readings: 2, sessionId: null });
    expect(graph.buckets.find((bucket) => bucket.start === "2026-09-15")!.sessionId).toBe("c");
  });
});
