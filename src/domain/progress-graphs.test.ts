import { describe, expect, it } from "vitest";

import { presetRange } from "./graph-range";
import {
  averagePace,
  exerciseSessions,
  foodGraph,
  measuresWithData,
  recoveryDays,
  recoveryGraph,
  runningGraph,
  strengthGraph,
  strengthGroupOf,
  type ExerciseSetRow,
  type StrengthRow,
} from "./progress-graphs";
import type { RecoveryReading } from "./recovery";

const TODAY = "2026-10-07";
const MONTH = presetRange("1m", TODAY); // 8 Sept – 7 Oct, by day
const QUARTER = presetRange("3m", TODAY); // from Mon 6 Jul, by week

describe("volume by muscle group", () => {
  it("files an exercise under one group, its first primary muscle's", () => {
    // A squat: quads first, so legs, whatever else it names.
    expect(strengthGroupOf(["quads", "glutes"])).toBe("legs");
    // A row names the lats first: back, though it works the biceps too.
    expect(strengthGroupOf(["lats", "biceps"])).toBe("back");
    expect(strengthGroupOf(["triceps"])).toBe("arms");
    // A muscle the app no longer knows is passed over; none known is no group.
    expect(strengthGroupOf(["gills", "abs"])).toBe("core");
    expect(strengthGroupOf([])).toBeNull();
  });

  const rows: StrengthRow[] = [
    {
      sessionId: "a",
      date: "2026-09-14",
      primaryMuscles: ["quads"],
      workingSets: 4,
      volumeKg: 2000,
    },
    {
      sessionId: "a",
      date: "2026-09-14",
      primaryMuscles: ["chest"],
      workingSets: 3,
      volumeKg: 900,
    },
    // Pull-ups: back work with no load to count.
    { sessionId: "b", date: "2026-09-16", primaryMuscles: ["lats"], workingSets: 4, volumeKg: 0 },
    {
      sessionId: "c",
      date: "2026-09-30",
      primaryMuscles: ["quads"],
      workingSets: 5,
      volumeKg: 2500.55,
    },
    // A movement that names no muscle: under All only.
    { sessionId: "c", date: "2026-09-30", primaryMuscles: [], workingSets: 2, volumeKg: 100 },
    // Outside the month: left out.
    {
      sessionId: "z",
      date: "2026-08-01",
      primaryMuscles: ["quads"],
      workingSets: 9,
      volumeKg: 5000,
    },
  ];

  it("totals each group's own exercises, and every exercise once under All", () => {
    const graph = strengthGraph(rows, MONTH, TODAY);
    expect(graph.totals.volume).toEqual({
      all: 5500.6,
      legs: 4500.6,
      chest: 900,
      back: 0,
      shoulders: 0,
      arms: 0,
      core: 0,
    });
    // Sets count work with or without a load: the back's pull-ups are four.
    expect(graph.totals.sets).toMatchObject({ all: 18, legs: 9, chest: 3, back: 4 });
    expect(graph.workouts).toMatchObject({ all: 3, legs: 2, chest: 1, back: 1, arms: 0 });
    // The weekly average is taken over the weeks trained (two), not the month's five.
    expect(graph.weeksTrained).toBe(2);
  });

  it("puts each day's volume in its slot, and names the slot's one workout", () => {
    const graph = strengthGraph(rows, MONTH, TODAY);
    expect(graph.buckets).toHaveLength(30);
    const day = graph.buckets.find((bucket) => bucket.start === "2026-09-14")!;
    expect(day.volume).toMatchObject({ all: 2900, legs: 2000, chest: 900 });
    expect(day.sets.all).toBe(7);
    expect(day.sessionId).toMatchObject({ all: "a", legs: "a", chest: "a" });
    expect(day.sessionId.back).toBeUndefined();
    const weekly = strengthGraph(rows, QUARTER, TODAY).buckets.find(
      (bucket) => bucket.start === "2026-09-14",
    )!;
    // Two workouts in the week: no single one to open, but the chest's came from one.
    expect(weekly).toMatchObject({ volume: { all: 2900, back: 0 }, workouts: { all: 2 } });
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
