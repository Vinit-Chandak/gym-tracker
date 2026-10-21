import { describe, expect, it } from "vitest";

import {
  actualDistanceMetres,
  distanceFromLengths,
  emptyActual,
  formatPaceSeconds,
  formatSpeed,
  nativeDistance,
  nonSwimmingMs,
  paceSecondsPerKm,
  speedMetresPerSecond,
  swimPaceSecondsPer100,
  validateActual,
  lapPaceSecondsPerKm,
  runPeakHeartRate,
  type CyclingActualV1,
  type RunningActualV1,
  type RunningLap,
  type SwimmingActualV1,
} from "./activity-metrics";

const MINUTE = 60_000;

const run = (overrides: Partial<RunningActualV1> = {}): RunningActualV1 => ({
  sport: "running",
  environment: "outdoor",
  distance: nativeDistance(5, "km"),
  durationMs: 30 * MINUTE,
  surface: null,
  elevationGainMetres: null,
  treadmillInclinePercent: null,
  averageHeartRate: null,
  maxHeartRate: null,
  cadenceStepsPerMinute: null,
  runType: null,
  laps: [],
  ...overrides,
});

const ride = (overrides: Partial<CyclingActualV1> = {}): CyclingActualV1 => ({
  ...emptyActual("cycling"),
  durationMs: 30 * MINUTE,
  ...overrides,
});

const swim = (overrides: Partial<SwimmingActualV1> = {}): SwimmingActualV1 => ({
  ...emptyActual("swimming"),
  elapsedMs: 10 * MINUTE,
  ...overrides,
});

describe("running", () => {
  /** AT-LOG-01: one recorded duration, and the pace that follows from it. */
  it("derives pace from the recorded distance and duration", () => {
    expect(paceSecondsPerKm(5000, 30 * MINUTE)).toBe(360);
    expect(formatPaceSeconds(360)).toBe("6:00");
    expect(validateActual(run())).toEqual([]);
  });

  it("requires a positive distance and duration", () => {
    expect(validateActual(run({ distance: nativeDistance(0, "km") }))).toEqual([
      { field: "distance", message: "Enter how far you ran." },
    ]);
    expect(validateActual(run({ durationMs: 0 }))[0]?.field).toBe("duration");
  });

  /** AT-LOG-02: an incline belongs to a treadmill; the shin fields are gone from the model. */
  it("refuses an incline on an outdoor run", () => {
    expect(validateActual(run({ treadmillInclinePercent: 2 }))[0]?.field).toBe(
      "treadmillInclinePercent",
    );
    expect(validateActual(run({ environment: "treadmill", treadmillInclinePercent: 2 }))).toEqual(
      [],
    );
  });

  it("rejects a maximum heart rate below the average", () => {
    expect(validateActual(run({ averageHeartRate: 150, maxHeartRate: 140 }))[0]?.field).toBe(
      "maxHeartRate",
    );
    expect(validateActual(run({ averageHeartRate: 150, maxHeartRate: 172 }))).toEqual([]);
  });
});

describe("a run's laps (ADR 0059)", () => {
  const lap = (overrides: Partial<RunningLap> = {}): RunningLap => ({
    phase: "work",
    distance: nativeDistance(800, "m"),
    durationMs: 3 * MINUTE,
    averageHeartRate: null,
    maxHeartRate: null,
    ...overrides,
  });

  it("takes reps as distances and times, or a time alone, and paces only what was measured", () => {
    const timed = lap({ distance: null, durationMs: 2 * MINUTE });
    expect(validateActual(run({ laps: [lap(), timed, lap({ phase: "recovery" })] }))).toEqual([]);
    expect(lapPaceSecondsPerKm(lap())).toBe(225);
    expect(lapPaceSecondsPerKm(timed)).toBeNull();
  });

  it("refuses a lap that says neither how far nor how long", () => {
    const problems = validateActual(
      run({ laps: [lap(), lap({ distance: null, durationMs: null })] }),
    );
    expect(problems).toEqual([
      { field: "laps", message: "Give lap 2 a distance, a time or both." },
    ]);
  });

  it("refuses laps that add up to more than the run", () => {
    const tooLong = Array.from({ length: 11 }, () => lap());
    expect(validateActual(run({ laps: tooLong })).map((problem) => problem.message)).toEqual([
      "The laps add up to longer than the run.",
      "The laps add up to further than the run.",
    ]);
  });

  it("checks each lap's heart rate and says which lap", () => {
    expect(
      validateActual(run({ laps: [lap({ averageHeartRate: 170, maxHeartRate: 160 })] })),
    ).toEqual([
      { field: "laps", message: "lap 1: Maximum heart rate cannot be below the average." },
    ]);
  });

  it("reads a run's peak heart rate from its laps as well as its whole", () => {
    expect(runPeakHeartRate(run({ maxHeartRate: 181 }))).toBe(181);
    expect(runPeakHeartRate(run({ maxHeartRate: 181, laps: [lap({ maxHeartRate: 189 })] }))).toBe(
      189,
    );
    expect(runPeakHeartRate(run())).toBeNull();
  });
});

describe("cycling", () => {
  /** AT-LOG-03: a 30-minute indoor ride with no distance is a complete record. */
  it("saves a duration-only ride and derives no speed for it", () => {
    const indoor = ride({ environment: "indoor" });
    expect(validateActual(indoor)).toEqual([]);
    expect(actualDistanceMetres(indoor)).toBeNull();
    expect(speedMetresPerSecond(actualDistanceMetres(indoor), indoor.durationMs)).toBeNull();
    expect(formatSpeed(null)).toBe("—");
  });

  /** AT-LOG-04: an explicit zero is a reported zero; unknown stays unknown. */
  it("keeps an explicit zero distance apart from an unknown one", () => {
    const zero = ride({ distance: nativeDistance(0, "km") });
    expect(actualDistanceMetres(zero)).toBe(0);
    expect(speedMetresPerSecond(0, zero.durationMs)).toBe(0);
    expect(actualDistanceMetres(ride())).toBeNull();
  });

  /** AT-LOG-19: assistance has three states and no silent default. */
  it("starts with assistance unknown rather than unassisted", () => {
    expect(emptyActual("cycling").assistance).toBe("unknown");
  });

  it("converts speed for display without changing what was stored", () => {
    const outdoor = ride({ distance: nativeDistance(15, "km"), durationMs: 30 * MINUTE });
    const speed = speedMetresPerSecond(actualDistanceMetres(outdoor), outdoor.durationMs);
    expect(formatSpeed(speed, "km")).toBe("30 km/h");
    expect(formatSpeed(speed, "mi")).toBe("18.6 mph");
  });
});

describe("swimming", () => {
  /** AT-LOG-05: one length is one trip down the pool. */
  it("derives distance from lengths and the pool's own size", () => {
    expect(distanceFromLengths(16, nativeDistance(25, "m"))).toBe(400);
    expect(distanceFromLengths(16, nativeDistance(25, "yd"))).toBe(365.76);
    const pool = swim({
      distanceMethod: "lengths",
      poolLength: nativeDistance(25, "m"),
      lengths: 16,
    });
    expect(validateActual(pool)).toEqual([]);
    expect(actualDistanceMetres(pool)).toBe(400);
  });

  /** AT-LOG-06: two authoritative totals cannot coexist. */
  it("refuses a hand-entered distance alongside a length count", () => {
    const both = swim({
      distanceMethod: "lengths",
      poolLength: nativeDistance(25, "m"),
      lengths: 16,
      distance: nativeDistance(400, "m"),
    });
    expect(validateActual(both).map((problem) => problem.field)).toContain("distance");
  });

  /** AT-LOG-07: pool metadata cannot be asserted about open water. */
  it("refuses lengths and a pool size in open water", () => {
    const open = swim({
      environment: "open_water",
      distanceMethod: "lengths",
      poolLength: nativeDistance(25, "m"),
      lengths: 10,
    });
    const fields = validateActual(open).map((problem) => problem.field);
    expect(fields).toContain("distanceMethod");
    expect(fields).toContain("poolLength");
  });

  it("accepts an elapsed-only swim and fabricates no pace for it", () => {
    const vague = swim();
    expect(validateActual(vague)).toEqual([]);
    expect(actualDistanceMetres(vague)).toBeNull();
    expect(swimPaceSecondsPer100(vague)).toBeNull();
  });

  /** AT-LOG-08: pace comes from the swimming time, never from the elapsed time. */
  it("paces a swim by its swimming time in the unit it was swum in", () => {
    const yards = swim({
      elapsedMs: 10 * MINUTE,
      activeMs: 8 * MINUTE,
      distanceMethod: "manual",
      distance: nativeDistance(400, "yd"),
    });
    expect(validateActual(yards)).toEqual([]);
    expect(swimPaceSecondsPer100(yards, "yd")).toBe(120);
    expect(formatPaceSeconds(swimPaceSecondsPer100(yards, "yd")!, 1)).toBe("2:00.0");
    // The same swim in metres is a different number, and says so.
    expect(swimPaceSecondsPer100(yards, "m")).toBeCloseTo(131.23, 2);
  });

  it("refuses a swimming time longer than the elapsed time", () => {
    expect(validateActual(swim({ elapsedMs: 5 * MINUTE, activeMs: 6 * MINUTE }))[0]?.field).toBe(
      "activeMs",
    );
  });

  /** AT-LOG-09: the gap is unclassified time, not measured rest. */
  it("reports the non-swimming remainder without calling it rest", () => {
    expect(nonSwimmingMs(swim({ elapsedMs: 10 * MINUTE, activeMs: 8 * MINUTE }))).toBe(2 * MINUTE);
    expect(nonSwimmingMs(swim())).toBeNull();
  });
});
