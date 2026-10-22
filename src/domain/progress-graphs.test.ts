import { describe, expect, it } from "vitest";

import { allRange, customRange, presetRange } from "./graph-range";
import { addDays, daysBetween } from "./program-calendar";
import {
  averagePace,
  bestSession,
  exerciseSessions,
  foodGraph,
  measuresWithData,
  reachesTarget,
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

  it("counts a trained week the range cuts short for its days in the range", () => {
    // 8 Sept (a Tuesday) to Wednesday 7 Oct: six days of the first week, three of the last.
    const edges: StrengthRow[] = [
      {
        sessionId: "a",
        date: "2026-09-08",
        primaryMuscles: ["quads"],
        workingSets: 3,
        volumeKg: 900,
      },
      {
        sessionId: "b",
        date: "2026-10-06",
        primaryMuscles: ["quads"],
        workingSets: 3,
        volumeKg: 900,
      },
    ];
    expect(strengthGraph(edges, MONTH, TODAY).weeksTrained).toBeCloseTo(9 / 7);
    // A month trained every week, as 12 Sept to Sunday 11 Oct: 2 days of the first week and
    // four whole ones, about 4.3 weeks, never the five calendar weeks it touches.
    const today = "2026-10-11";
    const weekly: StrengthRow[] = [
      "2026-09-12",
      "2026-09-15",
      "2026-09-22",
      "2026-09-29",
      "2026-10-06",
    ].map((date, i) => ({
      sessionId: `w${i}`,
      date,
      primaryMuscles: ["chest"],
      workingSets: 3,
      volumeKg: 1000,
    }));
    const graph = strengthGraph(weekly, presetRange("1m", today), today);
    expect(graph.weeksTrained).toBeCloseTo(4 + 2 / 7);
    expect(graph.totals.volume.all / graph.weeksTrained).toBeCloseTo(5000 / (30 / 7));
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
    // A stack step or a plate count is a position, not a weight: step 12 × 10 is no volume.
    expect(stack).toMatchObject({ maxWeight: 12, maxVolume: null });
    expect(measuresWithData([stack!])).toEqual(["maxWeight", "maxReps"]);
    const [plates] = exerciseSessions([set("a", 4, 8)], "machine", "plate_count");
    expect(measuresWithData([plates!])).toEqual(["maxWeight", "maxReps"]);
    // A machine loaded in kilograms still has its biggest set.
    const [kilos] = exerciseSessions([set("a", 50, 10)], "machine", "kg");
    expect(kilos!.maxVolume).toBe(500);
  });

  it("keeps the least help on an assisted machine as its best, and gives it no volume", () => {
    // A beginner's assisted pull-ups: 40 kg of help in September, 25 kg (stronger) in October.
    const sessions = exerciseSessions(
      [
        set("a", 40, 8),
        set("a", 45, 10),
        set("a", 40, 10),
        set("b", 25, 8),
        set("b", 30, 8),
        set("b", 25, 6),
      ],
      "machine",
      "kg",
      { assisted: true },
    );
    expect(sessions).toEqual([
      expect.objectContaining({
        sessionId: "a",
        // The least help, and the most reps done with it.
        maxWeight: 40,
        maxWeightReps: 10,
        // Ten reps twice: with 40 kg of help is the stronger of the two.
        maxReps: 10,
        maxRepsWeight: 40,
        maxVolume: null,
        e1rm: null,
      }),
      expect.objectContaining({ sessionId: "b", maxWeight: 25, maxWeightReps: 8, maxReps: 8 }),
    ]);
    expect(measuresWithData(sessions)).toEqual(["maxWeight", "maxReps"]);
    // The same sets on a machine that adds load keep the heaviest, and their volume.
    const [loaded] = exerciseSessions([set("a", 40, 8), set("a", 45, 10)], "machine", "kg");
    expect(loaded).toMatchObject({ maxWeight: 45, maxVolume: 450 });
  });

  it("keeps zero assistance as the strongest set rather than an unanswered load", () => {
    const sessions = exerciseSessions(
      [set("a", 10, 8), set("b", 0, 8), set("b", null, 6)],
      "machine",
      "kg",
      { assisted: true },
    );
    expect(sessions[1]).toMatchObject({
      maxWeight: 0,
      maxWeightReps: 8,
      maxRepsWeight: 0,
      maxVolume: null,
      e1rm: null,
    });
    expect(bestSession(sessions, "maxWeight", { assisted: true })?.sessionId).toBe("b");
    expect(bestSession(sessions, "maxReps", { assisted: true })?.sessionId).toBe("b");
  });

  it("names a tied best by the better set behind it, then by the latest workout", () => {
    const rows = (sets: [string, number, number][]): ExerciseSetRow[] =>
      sets.map(([sessionId, weight, reps]) => ({
        ...set(sessionId, weight, reps),
        date: `2026-09-${sessionId.padStart(2, "0")}`,
      }));
    // Aarav's lat pulldown: 42.5 kg on the 17th for 11, and on the 24th for 12.
    const pulldown = exerciseSessions(
      rows([
        ["17", 40, 13],
        ["17", 42.5, 10],
        ["17", 42.5, 11],
        ["24", 40, 12],
        ["24", 42.5, 12],
        ["24", 42.5, 10],
      ]),
      "machine",
      "kg",
    );
    expect(bestSession(pulldown, "maxWeight")).toMatchObject({ date: "2026-09-24" });
    // The heavier set still wins whatever its reps.
    expect(bestSession([...pulldown].reverse(), "maxWeight")!.maxWeightReps).toBe(12);
    // Equal in every way: the day it was first reached, as a profile's Best lifts and the
    // friends' board date it — one read "29 Sept" and the other "Thu 8 Oct" for one best.
    const twice = exerciseSessions(
      rows([
        ["01", 170, 7],
        ["08", 185, 4],
      ]),
      "barbell",
      "lb",
    );
    expect(twice[0]!.e1rm).toBe(twice[1]!.e1rm);
    expect(bestSession(twice, "e1rm")).toMatchObject({ date: "2026-09-01" });
    const again = exerciseSessions(
      rows([
        ["01", 170, 7],
        ["08", 170, 7],
      ]),
      "barbell",
      "lb",
    );
    expect(bestSession(again, "e1rm")).toMatchObject({ date: "2026-09-01" });
    expect(bestSession(again, "maxWeight")).toMatchObject({ date: "2026-09-01" });
    // Most reps, tied: the heavier load behind them; on an assisted machine, the least help.
    const reps = rows([
      ["01", 30, 10],
      ["08", 20, 10],
    ]);
    expect(bestSession(exerciseSessions(reps, "machine", "kg"), "maxReps")).toMatchObject({
      date: "2026-09-01",
    });
    expect(
      bestSession(exerciseSessions(reps, "machine", "kg", { assisted: true }), "maxReps", {
        assisted: true,
      }),
    ).toMatchObject({ date: "2026-09-08" });
    // Less help is the stronger set, and a tie on it goes to more reps.
    const help = exerciseSessions(
      rows([
        ["01", 25, 6],
        ["08", 25, 8],
        ["15", 30, 12],
      ]),
      "machine",
      "kg",
      { assisted: true },
    );
    expect(bestSession(help, "maxWeight", { assisted: true })).toMatchObject({
      date: "2026-09-08",
    });
    expect(bestSession([], "maxWeight")).toBeNull();
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

  it("counts a run with breaks in distance and time, never as a pace", () => {
    const session = {
      id: "r5",
      date: "2026-09-24",
      environment: "outdoor" as const,
      metres: 6000,
      seconds: 2400,
      continuous: false,
    };
    const graph = runningGraph([...runs, session], MONTH, TODAY);
    expect(graph.totals).toMatchObject({ metres: 18000, runs: 5 });
    expect(graph.points.find((point) => point.id === "r5")!.pace).toBeNull();
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

  it("counts the days logged from the first there was to log, not the range's widened start", () => {
    // First logged on Friday 20 March and every day since. All starts on that week's Monday.
    const today = "2026-10-11";
    const all = allRange("2026-03-20", today);
    expect(all).toMatchObject({ from: "2026-03-16", bucket: "week" });
    const logged = Array.from({ length: daysBetween("2026-03-20", today) + 1 }, (_, i) => ({
      date: addDays("2026-03-20", i),
      kcal: 2000,
      protein: 120,
    }));
    // Every day since the first: 206 of 206, not of the 210 since the Monday.
    expect(foodGraph(logged, all, today, "2026-03-20")).toMatchObject({
      kcal: { days: 206 },
      days: 206,
    });
    expect(foodGraph(logged, all, today).days).toBe(210);
    // Dates chosen by hand count from the From chosen; a span keeps the start it was given.
    const custom = customRange("2026-01-15", "2026-03-31");
    expect(custom.from).toBe("2026-01-12");
    expect(foodGraph([], custom, today, "2026-01-15").days).toBe(76);
    // A first day before the range's own start counts from the range's start.
    expect(foodGraph([], MONTH, TODAY, "2026-01-01").days).toBe(30);
  });

  it("reaches a target in the whole kcal and grams the graph writes", () => {
    // 1.8 g a kilogram of 77.6 kg is 139.68 g, written 140: a day that reads 140 reaches it.
    expect(reachesTarget(139.6, 139.68)).toBe(true);
    expect(reachesTarget(139.4, 139.68)).toBe(false);
    expect(reachesTarget(2600, 2600)).toBe(true);
    expect(reachesTarget(3100, 2600)).toBe(true);
    expect(reachesTarget(2599.4, 2600)).toBe(false);
    // Nothing logged, or no target, reaches nothing.
    expect(reachesTarget(null, 140)).toBe(false);
    expect(reachesTarget(150, null)).toBe(false);
    expect(reachesTarget(150, 0)).toBe(false);
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
