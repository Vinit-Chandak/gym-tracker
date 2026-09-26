import { expect, it } from "vitest";
import { activityFormValues } from "./activity-form-values";
import {
  nativeDistance,
  type CyclingActualV1,
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
