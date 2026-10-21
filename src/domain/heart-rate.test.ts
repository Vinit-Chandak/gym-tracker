import { describe, expect, it } from "vitest";

import {
  customFloorsProblem,
  DEFAULT_HEART_RATE_SETTINGS,
  estimatedMaxHeartRate,
  maxZones,
  percentOfMax,
  raisedMaxHeartRate,
  reserveZones,
  resolveHeartRate,
  zoneOf,
  zoneRangeBeats,
  zoneRangeLabel,
  zoneTimeFromLaps,
  type HeartRateSettings,
} from "./heart-rate";

const settings = (patch: Partial<HeartRateSettings> = {}): HeartRateSettings => ({
  ...DEFAULT_HEART_RATE_SETTINGS,
  ...patch,
});

describe("estimating a maximum from age", () => {
  it("uses Tanaka's 208 − 0.7 × age, rounded", () => {
    expect(estimatedMaxHeartRate(28)).toBe(188); // 188.4
    expect(estimatedMaxHeartRate(40)).toBe(180);
    expect(estimatedMaxHeartRate(65)).toBe(163); // 162.5 rounds up
  });
});

describe("zones", () => {
  it("cuts the maximum at 50, 60, 70, 80 and 90 per cent", () => {
    expect(maxZones(190)).toEqual([
      { zone: 1, name: "Recovery", low: 95, high: 113 },
      { zone: 2, name: "Easy", low: 114, high: 132 },
      { zone: 3, name: "Aerobic", low: 133, high: 151 },
      { zone: 4, name: "Threshold", low: 152, high: 170 },
      { zone: 5, name: "Maximum", low: 171, high: 190 },
    ]);
  });

  it("takes the shares of the reserve with a resting rate (Karvonen)", () => {
    // 50 + 0.6 × (190 − 50) = 134: zone 2 starts twenty beats higher than by the maximum alone.
    const zones = reserveZones(190, 50);
    expect(zones.map((zone) => zone.low)).toEqual([120, 134, 148, 162, 176]);
    expect(zones[4]!.high).toBe(190);
  });

  it("places a reading in its zone, with 0 below zone 1", () => {
    const zones = maxZones(190);
    expect(zoneOf(80, zones)).toBe(0);
    expect(zoneOf(114, zones)).toBe(2);
    expect(zoneOf(151, zones)).toBe(3);
    expect(zoneOf(152, zones)).toBe(4);
    expect(zoneOf(200, zones)).toBe(5);
  });

  it("says a zone target in words and in this athlete's beats", () => {
    const zones = maxZones(190);
    expect(zoneRangeLabel([2, 2])).toBe("Zone 2");
    expect(zoneRangeLabel([3, 4])).toBe("Zones 3–4");
    expect(zoneRangeBeats([2, 2], zones)).toEqual([114, 132]);
    expect(zoneRangeBeats([4, 5], zones)).toEqual([152, 190]);
    expect(percentOfMax(171, 190)).toBe(90);
  });
});

describe("resolving the maximum in use", () => {
  it("has nothing to say without a maximum, a run or an age", () => {
    expect(resolveHeartRate(settings(), null)).toBeNull();
  });

  it("estimates from age until something better exists", () => {
    const resolved = resolveHeartRate(settings(), 28)!;
    expect(resolved.max).toBe(188);
    expect(resolved.basis).toBe("estimated");
    expect(resolved.method).toBe("max");
  });

  it("takes a run's higher reading over the estimate, but never a lower one", () => {
    const higher = resolveHeartRate(settings(), 28, {
      bpm: 196,
      on: "2026-10-01",
      activityId: null,
    })!;
    expect(higher).toMatchObject({ max: 196, basis: "observed", on: "2026-10-01" });
    const lower = resolveHeartRate(settings(), 28, {
      bpm: 171,
      on: "2026-10-01",
      activityId: null,
    })!;
    expect(lower).toMatchObject({ max: 188, basis: "estimated" });
  });

  it("does not adopt a reading no heart reaches", () => {
    const glitch = resolveHeartRate(settings(), 28, {
      bpm: 241,
      on: "2026-10-01",
      activityId: null,
    })!;
    expect(glitch.basis).toBe("estimated");
  });

  it("uses a stored maximum as it is, entered or recorded", () => {
    const entered = resolveHeartRate(
      settings({ maxHeartRate: 182, maxHeartRateSource: "entered", maxHeartRateOn: "2026-09-01" }),
      28,
      { bpm: 196, on: "2026-10-01", activityId: null },
    )!;
    expect(entered).toMatchObject({ max: 182, basis: "entered", on: "2026-09-01" });
  });

  it("reads reserve without a resting rate as max, and custom only when it is usable", () => {
    expect(resolveHeartRate(settings({ zoneMethod: "reserve" }), 40)!.method).toBe("max");
    expect(
      resolveHeartRate(settings({ zoneMethod: "reserve", restingHeartRate: 55 }), 40)!.method,
    ).toBe("reserve");
    const custom = resolveHeartRate(
      settings({ zoneMethod: "custom", customZoneFloors: [100, 125, 140, 155, 170] }),
      40,
    )!;
    expect(custom.method).toBe("custom");
    expect(custom.zones[1]).toMatchObject({ low: 125, high: 139 });
    expect(custom.zones[4]).toMatchObject({ low: 170, high: 180 });
    // Zone 5 starting above the maximum cannot be used; the zones fall back to the maximum's.
    expect(
      resolveHeartRate(
        settings({ zoneMethod: "custom", customZoneFloors: [100, 125, 140, 155, 185] }),
        40,
      )!.method,
    ).toBe("max");
  });
});

describe("custom floors", () => {
  it("needs five whole, rising floors below the maximum", () => {
    expect(customFloorsProblem([100, 125, 140, 155, 170], 190)).toBeNull();
    expect(customFloorsProblem([100, 125, 140, 155], 190)).toMatch(/five/);
    expect(customFloorsProblem([100, 125, 125, 155, 170], 190)).toMatch(/above/);
    expect(customFloorsProblem([100, 125, 140, 155, 190], 190)).toMatch(/below your maximum/);
    expect(customFloorsProblem([100.5, 125, 140, 155, 170], 190)).toMatch(/whole/);
  });
});

describe("raising the maximum from a run", () => {
  it("raises the maximum in use when a run records more", () => {
    expect(raisedMaxHeartRate(settings(), 188, 194)).toBe(194);
    expect(raisedMaxHeartRate(settings(), 188, 185)).toBeNull();
    expect(raisedMaxHeartRate(settings(), 188, 188)).toBeNull();
  });

  it("leaves everything alone when switched off, unknown or implausible", () => {
    expect(raisedMaxHeartRate(settings({ maxHeartRateAuto: false }), 188, 199)).toBeNull();
    expect(raisedMaxHeartRate(settings(), 188, null)).toBeNull();
    expect(raisedMaxHeartRate(settings(), 188, 238)).toBeNull();
  });

  it("stores the first reading when there is nothing to compare it with, if a heart can be at it", () => {
    expect(raisedMaxHeartRate(settings(), null, 176)).toBe(176);
    // An easy jog's 92 is not anybody's maximum.
    expect(raisedMaxHeartRate(settings(), null, 92)).toBeNull();
  });
});

describe("time in zones from laps", () => {
  it("counts each lap's time in the zone of its average, leaving out laps without one", () => {
    const zones = maxZones(190);
    expect(
      zoneTimeFromLaps(
        [
          { durationMs: 600_000, averageHeartRate: 125 },
          { durationMs: 180_000, averageHeartRate: 172 },
          { durationMs: 120_000, averageHeartRate: 140 },
          { durationMs: 180_000, averageHeartRate: 175 },
          { durationMs: 300_000, averageHeartRate: null },
        ],
        zones,
      ),
    ).toEqual([
      { zone: 2, ms: 600_000 },
      { zone: 3, ms: 120_000 },
      { zone: 5, ms: 360_000 },
    ]);
  });
});
