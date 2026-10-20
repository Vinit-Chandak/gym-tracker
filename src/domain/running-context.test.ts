import { describe, expect, it } from "vitest";

import {
  bestEfforts,
  legLoad,
  longestRunWithin,
  predictions,
  riegelSeconds,
  runMix,
  runningWeeks,
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
  ...overrides,
});

const runs = [
  run("a", "2026-10-19", 8, 48, { runType: "easy" }),
  run("b", "2026-10-17", 16, 100, { runType: "long" }),
  run("c", "2026-10-14", 5.1, 24, { runType: "time_trial" }),
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
      { label: "5K", metres: 5000, seconds: 1412, on: "2026-10-14", sourceId: "activity:c" },
      { label: "10K", metres: 10000, seconds: 3235, on: "2026-10-06", sourceId: "activity:d" },
    ]);
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
