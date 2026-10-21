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
  countedRunPace,
  lapFigures,
  lapPaceSecondsPerKm,
  lapsMakeIntervals,
  lapTotals,
  paceHasRests,
  repPace,
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

  it("refuses a lap that says neither how far nor how long, at that lap", () => {
    const problems = validateActual(
      run({ laps: [lap(), lap({ distance: null, durationMs: null })] }),
    );
    expect(problems).toEqual([
      { field: "laps.1", message: "Give lap 2 a distance, a time or both." },
    ]);
  });

  it("says a lap's distance and time at that lap's own field", () => {
    expect(
      validateActual(
        run({ laps: [lap(), lap({ distance: nativeDistance(2000, "km"), durationMs: 0 })] }),
      ),
    ).toEqual([
      { field: "laps.1.distance", message: "Enter lap 2's distance up to 1000 km." },
      {
        field: "laps.1.time",
        message: "Enter lap 2's time as more than zero and under seven days.",
      },
      // The run's own total is then short of its laps too, and says so where it is typed.
      { field: "distance", message: "The laps add up to 2000.80 km, more than 5.00 km." },
    ]);
  });

  it("says typed totals short of the laps at the total, with what the laps add up to", () => {
    const tooLong = Array.from({ length: 11 }, () => lap());
    expect(validateActual(run({ laps: tooLong }))).toEqual([
      { field: "duration", message: "The laps add up to 33:00, longer than 30:00." },
      { field: "distance", message: "The laps add up to 8.80 km, more than 5.00 km." },
    ]);
    // Within a second a lap and a hundredth of the distance, a watch's rounding is not a typo.
    const close = Array.from({ length: 6 }, () => lap({ durationMs: 5 * MINUTE + 300 }));
    expect(validateActual(run({ distance: nativeDistance(4.75, "km"), laps: close }))).toEqual([]);
  });

  it("checks each lap's heart rate and says it at that lap", () => {
    expect(
      validateActual(run({ laps: [lap({ averageHeartRate: 170, maxHeartRate: 160 })] })),
    ).toEqual([
      {
        field: "laps.0.maxHeartRate",
        message: "Maximum heart rate cannot be below the average.",
      },
    ]);
  });

  it("adds the laps up, a standing recovery adding time and no distance", () => {
    const laps = [
      lap({ distance: nativeDistance(0.47, "km"), durationMs: 120_000 }),
      lap({ phase: "recovery", distance: null, durationMs: 90_000 }),
      lap({ distance: nativeDistance(0.51, "km"), durationMs: 117_000 }),
      lap({ distance: null, durationMs: 60_000 }),
    ];
    expect(lapTotals(laps.map(lapFigures))).toEqual({ metres: 980, durationMs: 387_000 });
    expect(lapTotals([])).toEqual({ metres: 0, durationMs: 0 });
  });

  it("reads reps with recoveries as intervals, and reps alone or splits as not", () => {
    expect(lapsMakeIntervals([{ phase: "work" }, { phase: "recovery" }])).toBe(true);
    expect(lapsMakeIntervals([{ phase: "work" }, { phase: "work" }])).toBe(false);
    expect(lapsMakeIntervals([{ phase: null }, { phase: "recovery" }])).toBe(false);
  });

  it("paces the reps that have both a distance and a time, and says how many", () => {
    const laps = [
      lap({ phase: "warmup", distance: nativeDistance(2, "km"), durationMs: 12 * MINUTE }),
      lap({ distance: nativeDistance(400, "m"), durationMs: 96_000 }),
      lap({ phase: "recovery", distance: null, durationMs: 90_000 }),
      lap({ distance: nativeDistance(400, "m"), durationMs: 98_000 }),
      lap({ distance: null, durationMs: 100_000 }),
    ];
    expect(repPace(laps.map(lapFigures))).toEqual({ secondsPerKm: 242.5, reps: 2 });
    expect(repPace([lapFigures(lap({ phase: "recovery" }))])).toBeNull();
  });

  it("counts a session with rests by its reps' pace, never its overall pace", () => {
    const laps = [
      lap({ distance: nativeDistance(1, "km"), durationMs: 4 * MINUTE }),
      lap({ phase: "recovery", distance: null, durationMs: 2 * MINUTE }),
      lap({ distance: nativeDistance(1, "km"), durationMs: 4 * MINUTE }),
    ];
    const intervals = run({ distance: nativeDistance(2, "km"), durationMs: 10 * MINUTE, laps });
    expect(paceHasRests(intervals)).toBe(true);
    expect(countedRunPace(intervals)).toEqual({ kind: "reps", secondsPerKm: 240, reps: 2 });
    // Called intervals without laps: its pace has its rests in it, and no reps to read instead.
    expect(countedRunPace(run({ runType: "intervals" }))).toBeNull();
    expect(countedRunPace(run())).toEqual({ kind: "overall", secondsPerKm: 360 });
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
