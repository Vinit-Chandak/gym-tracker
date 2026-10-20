import { expect, it } from "vitest";

import type { RunningActualV1, SwimmingActualV1 } from "@/domain/activity-metrics";
import { nativeDistance } from "@/domain/activity-metrics";

import { recordedExtras } from "./recorded-extras";

// Liam's run of Sat 10 Oct: 4.4 mi with 89 m of climb, and no heart rate.
const run: RunningActualV1 = {
  sport: "running",
  environment: "outdoor",
  distance: nativeDistance(4.4, "mi"),
  durationMs: 2_155_000,
  surface: null,
  elevationGainMetres: 89,
  treadmillInclinePercent: null,
  averageHeartRate: null,
  maxHeartRate: null,
  cadenceStepsPerMinute: null,
  runType: null,
  laps: [],
};

it("shows the climb in feet beside miles and in metres beside kilometres", () => {
  expect(recordedExtras(run, { distanceUnit: "mi", poolUnit: "yd" })).toEqual([
    { label: "Elevation gain", figure: "292", unit: "ft" },
  ]);
  expect(recordedExtras(run, { distanceUnit: "km", poolUnit: "m" })).toEqual([
    { label: "Elevation gain", figure: "89", unit: "m" },
  ]);
});

it("shows the heart rate it was given, and nothing it was not", () => {
  const units = { distanceUnit: "km", poolUnit: "m" } as const;
  expect(recordedExtras({ ...run, elevationGainMetres: null }, units)).toEqual([]);
  expect(
    recordedExtras({ ...run, elevationGainMetres: null, averageHeartRate: 152 }, units),
  ).toEqual([{ label: "Average heart rate", figure: "152", unit: "bpm" }]);
  const swim: SwimmingActualV1 = {
    sport: "swimming",
    environment: "open_water",
    elapsedMs: 1_882_000,
    activeMs: null,
    distanceMethod: "manual",
    distance: nativeDistance(1500, "m"),
    poolLength: null,
    lengths: null,
    stroke: "freestyle",
    strokeCount: null,
    resourceId: null,
    averageHeartRate: 141,
    maxHeartRate: 163,
  };
  expect(recordedExtras(swim, units).map((stat) => stat.label)).toEqual([
    "Average heart rate",
    "Maximum heart rate",
  ]);
});
