import { describe, expect, it } from "vitest";

import { maxZones } from "./heart-rate";
import type { RecordedLap } from "./run-segments";
import {
  bestEfforts,
  effortShare,
  fastestReps,
  latestRaceOrTrial,
  legLoad,
  longestRunWithin,
  paceByEffort,
  predictions,
  predictsRaces,
  riegelSeconds,
  runHeartRate,
  runLog,
  runMix,
  runningConsistency,
  runningHabits,
  runningWeeks,
  typicalRuns,
  usualRunDays,
  type LoggedRun,
} from "./running-context";

const run = (
  id: string,
  occurredOn: string,
  km: number,
  minutes: number,
  overrides: Partial<LoggedRun> = {},
): LoggedRun => ({
  id,
  occurredOn,
  distanceMetres: km * 1000,
  durationMs: minutes * 60_000,
  runType: null,
  environment: "outdoor",
  effort: null,
  laps: [],
  ...overrides,
});

const runs = [
  run("a", "2026-10-19", 8, 48, { runType: "easy" }),
  run("b", "2026-10-17", 16, 100, { runType: "long" }),
  run("c", "2026-10-14", 5.1, 24, { runType: "time_trial", effort: 5 }),
  run("d", "2026-10-06", 10.2, 55, { environment: "treadmill" }),
];

describe("the athlete's running, week by week", () => {
  it("counts every week, the empty ones as zero, newest first", () => {
    const weeks = runningWeeks(runs, "2026-10-20", 3);
    expect(weeks).toEqual([
      { weekStart: "2026-10-19", runs: 1, km: 8, minutes: 48, longestKm: 8 },
      { weekStart: "2026-10-12", runs: 2, km: 21.1, minutes: 124, longestKm: 16 },
      { weekStart: "2026-10-05", runs: 1, km: 10.2, minutes: 55, longestKm: 10.2 },
    ]);
    expect(runningWeeks([], "2026-10-20", 1)[0]).toMatchObject({ runs: 0, km: 0, longestKm: 0 });
  });

  it("finds the longest run of the last thirty days", () => {
    expect(longestRunWithin(runs, "2026-10-20", 30)).toEqual({ km: 16, on: "2026-10-17", id: "b" });
    expect(longestRunWithin(runs, "2026-12-31", 30)).toBeNull();
  });

  it("says what kinds of run they were, and where", () => {
    expect(runMix(runs)).toEqual({
      types: { easy: 1, long: 1, time_trial: 1 },
      untyped: 1,
      environments: { outdoor: 3, treadmill: 1 },
    });
  });
});

describe("best efforts and what they predict", () => {
  it("takes the fastest whole run at each distance, scaled to the exact distance", () => {
    expect(bestEfforts(runs)).toEqual([
      // 5.1 km in 24:00 is 4:42/km: 23:32 for 5 km.
      // Each with what the athlete said of it: the time trial was all-out, the 10K unsaid.
      {
        label: "5K",
        metres: 5000,
        seconds: 1412,
        on: "2026-10-14",
        sourceId: "activity:c",
        effort: 5,
        runType: "time_trial",
        part: "whole run",
        rep: false,
      },
      {
        label: "10K",
        metres: 10000,
        seconds: 3235,
        on: "2026-10-06",
        sourceId: "activity:d",
        effort: null,
        runType: null,
        part: "whole run",
        rep: false,
      },
    ]);
  });

  const lap = (metres: number, seconds: number, phase: RecordedLap["phase"] = null) => ({
    phase,
    distanceMetres: metres,
    durationMs: seconds * 1000,
  });

  it("finds a 5K inside a longer run from laps run back to back, as they were run", () => {
    // Ten 1 km laps adding up to the run: laps 4–8 were the fastest five.
    const paces = [330, 325, 320, 290, 288, 286, 289, 291, 320, 330];
    const long = run("l", "2026-10-18", 10, paces.reduce((sum, value) => sum + value, 0) / 60, {
      runType: "long",
      laps: paces.map((seconds) => lap(1000, seconds)),
    });
    const efforts = bestEfforts([long]);
    expect(efforts.find((effort) => effort.label === "5K")).toMatchObject({
      seconds: 1444,
      part: "laps 4–8",
      rep: false,
    });
    expect(efforts.find((effort) => effort.label === "1K")).toMatchObject({
      seconds: 286,
      part: "lap 6",
    });
    // A kilometre lap says nothing of its fastest 400 m: nobody measured it.
    expect(efforts.find((effort) => effort.label === "400 m")).toBeUndefined();
  });

  it("counts a rep at its own distance, and never the session's total", () => {
    // 6 × 400 m with a walk after each but the last, and a total that holds the walks.
    const laps = Array.from({ length: 6 }, (_, i) => [
      lap(400, i === 1 ? 84 : 90, "work"),
      ...(i < 5 ? [lap(100, 90, "recovery")] : []),
    ]).flat();
    const session = run("i", "2026-10-13", 2.9, 18, { runType: "intervals", effort: 4, laps });
    expect(bestEfforts([session])).toEqual([
      {
        label: "400 m",
        metres: 400,
        seconds: 84,
        on: "2026-10-13",
        sourceId: "activity:i",
        effort: 4,
        runType: "intervals",
        part: "rep 2 of 6",
        rep: true,
      },
    ]);
  });

  it("keeps a rep that matches no benchmark at its own distance, never a guessed one", () => {
    // 3 × 2 minutes of 500 m: not a 400 m nobody timed, but 500 m in 2:00.
    const session = run("r", "2026-10-15", 1.5, 6, {
      runType: "intervals",
      laps: [lap(500, 120), lap(500, 118), lap(500, 122)],
    });
    expect(bestEfforts([session])).toEqual([]);
    expect(fastestReps([session])).toEqual([
      {
        metres: 500,
        seconds: 118,
        paceSecondsPerKm: 236,
        on: "2026-10-15",
        sourceId: "activity:r",
        effort: null,
        runType: "intervals",
        part: "rep 2 of 3",
      },
    ]);
  });

  it("takes reps within 5 per cent of one another as the same distance", () => {
    const one = run("a", "2026-10-01", 0.8, 3, {
      runType: "intervals",
      laps: [lap(400, 90), lap(410, 89)],
    });
    const two = run("b", "2026-10-08", 2, 8, {
      runType: "intervals",
      laps: [lap(1000, 230), lap(1000, 228)],
    });
    expect(fastestReps([one, two]).map((rep) => [rep.metres, rep.seconds])).toEqual([
      // 410 m in 1:29 is the faster pace of the pair.
      [410, 89],
      [1000, 228],
    ]);
  });

  it("predicts races only from an unrested effort of three and a half minutes to 230", () => {
    expect(predictsRaces({ seconds: 1500, rep: false })).toBe(true);
    expect(predictsRaces({ seconds: 200, rep: false })).toBe(false);
    expect(predictsRaces({ seconds: 231 * 60, rep: false })).toBe(false);
    expect(predictsRaces({ seconds: 240, rep: true })).toBe(false);
  });

  it("offers only a race or a time trial as a recent race, never a fast training run", () => {
    const fast = run("f", "2026-10-19", 5.02, 21, { runType: "tempo" });
    expect(latestRaceOrTrial([fast, run("u", "2026-10-18", 5, 22)])).toBeNull();
    // A race is its course's distance at its own time, though the watch measured it short.
    const race = run("r", "2026-10-11", 4.9, 25, { runType: "race" });
    expect(latestRaceOrTrial([fast, race])).toEqual({
      label: "5K",
      metres: 5000,
      seconds: 1500,
      on: "2026-10-11",
    });
    // A time trial is the watch's distance, scaled to the one it stands for; the latest wins.
    const trial = run("t", "2026-10-14", 5.1, 24, { runType: "time_trial" });
    expect(latestRaceOrTrial([race, trial])).toMatchObject({ label: "5K", seconds: 1412 });
    // Any other distance keeps its own.
    expect(latestRaceOrTrial([run("o", "2026-10-15", 7, 35, { runType: "race" })])).toEqual({
      label: "Another distance",
      metres: 7000,
      seconds: 2100,
      on: "2026-10-15",
    });
  });

  it("leaves a session of reps and rests out, its rests in its time", () => {
    // Faster over 5.05 km than the time trial only on paper: its 24:00 is not a 5K time either.
    const intervals = run("e", "2026-10-15", 5.05, 23, { runType: "intervals" });
    expect(bestEfforts([...runs, intervals]).find((effort) => effort.label === "5K")).toMatchObject(
      { sourceId: "activity:c" },
    );
  });

  it("predicts with Riegel's exponent", () => {
    // A 25:00 5K predicts about 52:07 for 10K and 3:59:47 for the marathon.
    expect(Math.round(riegelSeconds(1500, 5000, 10_000))).toBe(3127);
    expect(predictions(5000, 1500).find((entry) => entry.label === "Marathon")!.seconds).toBe(
      14387,
    );
  });
});

describe("how hard a strength day is on the legs", () => {
  it("counts leg sets whole and calf sets half", () => {
    expect(
      legLoad([
        { sets: 4, primaryMuscles: ["quads", "glutes"] },
        { sets: 3, primaryMuscles: ["hamstrings"] },
        { sets: 4, primaryMuscles: ["calves"] },
      ]),
    ).toEqual({ sets: 9, load: "heavy" });
    expect(legLoad([{ sets: 4, primaryMuscles: ["chest"] }])).toEqual({ sets: 0, load: "none" });
    expect(legLoad([{ sets: 3, primaryMuscles: ["glutes"] }])).toEqual({ sets: 3, load: "light" });
  });
});

/**
 * ADR 0063: a runner's months, run by run, with what their runs usually look like, their usual
 * week, how steadily they ran and how much of it was easy.
 */
describe("a runner's months as a coach reads them", () => {
  // Eight weeks before Monday 26 October 2026: Tuesday and Thursday easy, a Sunday long run.
  const months: LoggedRun[] = Array.from({ length: 8 }, (_, index) => {
    const monday = new Date(Date.UTC(2026, 9, 26 - 7 * (index + 1)));
    const day = (offset: number) =>
      new Date(monday.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
    return [
      run(`tue-${index}`, day(1), 5, 35, { runType: "easy", effort: 2, averageHeartRate: 148 }),
      run(`thu-${index}`, day(3), 5, 34, { runType: "easy", effort: 3, averageHeartRate: 152 }),
      run(`sun-${index}`, day(6), 10 + index / 2, 75, { runType: "long", effort: 2 }),
    ];
  }).flat();

  it("reads a run's heart rate from its laps where the run has none", () => {
    expect(
      runHeartRate({ averageHeartRate: null, maxHeartRate: 170 }, [
        { durationMs: 600_000, averageHeartRate: 140, maxHeartRate: 150 },
        { durationMs: 300_000, averageHeartRate: 170, maxHeartRate: 178 },
        { durationMs: null, averageHeartRate: 120, maxHeartRate: null },
      ]),
    ).toEqual({ average: 150, max: 178 });
    expect(runHeartRate({ averageHeartRate: 155, maxHeartRate: null }, [])).toEqual({
      average: 155,
      max: null,
    });
  });

  it("lists every run with its pace, heart rate and zone, newest first", () => {
    const zones = maxZones(190);
    const [first] = runLog(
      [
        run("easy", "2026-10-20", 5, 35, { runType: "easy", effort: 2, averageHeartRate: 148 }),
        run("reps", "2026-10-22", 8, 50, { runType: "intervals", effort: 5 }),
      ],
      zones,
    );
    expect(first).toMatchObject({
      sourceId: "activity:reps",
      weekday: "Thursday",
      paceSecondsPerKm: null,
      hadBreaks: true,
    });
    const easy = runLog([run("easy", "2026-10-20", 5, 35, { averageHeartRate: 148 })], zones)[0];
    expect(easy).toMatchObject({ weekday: "Tuesday", km: 5, minutes: 35, paceSecondsPerKm: 420 });
    // 148 is 78% of 190: zone 3 of the default zones.
    expect(easy!.zone).toBe(3);
  });

  it("says what each kind of run and each effort usually look like", () => {
    const kinds = typicalRuns(months);
    // 7:00 and 6:48 a kilometre, eight of each: the middle is 6:54.
    expect(kinds[0]).toMatchObject({ kind: "easy", runs: 16, paceSecondsPerKm: 414 });
    expect(kinds[0]!.averageHeartRate).toBe(150);
    expect(kinds.find((kind) => kind.kind === "long")).toMatchObject({ runs: 8, effort: 2 });
    expect(paceByEffort(months).map((entry) => entry.effort)).toEqual([2, 3]);
  });

  it("finds the usual days, a usual run's length and the longest run", () => {
    expect(usualRunDays(months, "2026-10-28").map((entry) => entry.day)).toEqual([2, 4, 7]);
    expect(runningHabits(months, "2026-10-28")).toMatchObject({
      runDays: [
        { weekday: "Tuesday", weeks: 8 },
        { weekday: "Thursday", weeks: 8 },
        { weekday: "Sunday", weeks: 8 },
      ],
      // 35 and 34 minutes, each week's long run set aside, to the whole minute.
      usualRunMinutes: 35,
      longestRun: { minutes: 75 },
    });
    // Days that move week to week are no habit.
    expect(usualRunDays([run("a", "2026-10-13", 5, 30)], "2026-10-28")).toEqual([]);
  });

  it("says how steadily they ran and how much of it was easy", () => {
    expect(runningConsistency(months, "2026-10-28")).toEqual({
      weeks: 16,
      weeksWithRuns: 8,
      longestGapDays: 3,
      daysSinceLastRun: 3,
    });
    expect(runningConsistency([], "2026-10-28")).toMatchObject({
      weeksWithRuns: 0,
      longestGapDays: null,
    });
    // 880 easy minutes and 272 steady ones.
    expect(effortShare(months)).toEqual({ easy: 76, steady: 24, hard: 0, unknown: 0 });
    expect(effortShare([])).toBeNull();
  });
});
