import { expect, it } from "vitest";
import { activityFormValues } from "./activity-form-values";
import {
  nativeDistance,
  type CyclingActualV1,
  type RunningActualV1,
  type SwimmingActualV1,
} from "@/domain/activity-metrics";

it("keeps an unknown ride distance blank and an explicit zero distinct", () => {
  const ride: CyclingActualV1 = {
    sport: "cycling",
    environment: "indoor",
    durationMs: 4_201_000,
    distance: null,
    assistance: "assisted",
    resourceId: "bike-id",
    averagePowerWatts: 0,
    averageCadenceRpm: null,
    averageHeartRate: null,
    maxHeartRate: null,
    elevationGainMetres: null,
  };
  expect(activityFormValues(ride)).toMatchObject({
    hours: "1",
    minutes: "10",
    seconds: "1",
    distanceValue: "",
    averagePowerWatts: "0",
    averageCadenceRpm: "",
    assistance: "assisted",
    resourceId: "bike-id",
  });
  expect(activityFormValues({ ...ride, distance: nativeDistance(0, "mi") })).toMatchObject({
    distanceValue: "0",
    distanceUnit: "mi",
  });
});

it("restores yard pools and swim duration without rounding fractional seconds", () => {
  const swim: SwimmingActualV1 = {
    sport: "swimming",
    environment: "pool",
    elapsedMs: 4_220_500,
    activeMs: 3_900_100,
    distanceMethod: "lengths",
    distance: null,
    poolLength: nativeDistance(25, "yd"),
    lengths: 40,
    stroke: "freestyle",
    strokeCount: 0,
    resourceId: null,
    averageHeartRate: null,
    maxHeartRate: null,
  };
  expect(activityFormValues(swim)).toMatchObject({
    hours: "1",
    minutes: "10",
    seconds: "20.5",
    activeMinutes: "65",
    activeSeconds: "0.1",
    poolLengthValue: "25",
    poolLengthUnit: "yd",
    lengths: "40",
    strokeCount: "0",
  });
  expect(activityFormValues({ ...swim, activeMs: null })).toMatchObject({
    activeMinutes: "",
    activeSeconds: "",
  });
});

it("opens a run whose totals are its laps added up as From laps, and the watch's own as typed", () => {
  const laps: RunningActualV1["laps"] = (
    [
      { phase: "work", distance: nativeDistance(0.47, "km"), durationMs: 120_000 },
      { phase: "recovery", distance: null, durationMs: 90_000 },
      { phase: "work", distance: nativeDistance(0.51, "km"), durationMs: 117_000 },
    ] as const
  ).map((lap) => ({ ...lap, averageHeartRate: null, maxHeartRate: null }));
  const run: RunningActualV1 = {
    sport: "running",
    environment: "outdoor",
    distance: nativeDistance(0.98, "km"),
    durationMs: 327_000,
    runType: "intervals",
    surface: null,
    elevationGainMetres: null,
    treadmillInclinePercent: null,
    averageHeartRate: null,
    maxHeartRate: null,
    cadenceStepsPerMinute: null,
    laps,
  };
  expect(activityFormValues(run)).toMatchObject({
    distanceValue: "",
    distanceUnit: "km",
    hours: "",
    minutes: "",
    seconds: "",
    runType: "intervals",
  });
  // The watch's distance took in a warm-up it did not split: it opens as the watch said it.
  expect(
    activityFormValues({ ...run, distance: nativeDistance(2.5, "km"), durationMs: 900_000 }),
  ).toMatchObject({ distanceValue: "2.5", hours: "0", minutes: "15", seconds: "0" });
});
