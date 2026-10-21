import { describe, expect, it } from "vitest";

import { endurancePrescriptionSchema } from "@/domain/activity-prescription";
import { nativeDistance } from "@/domain/activity-metrics";

import { plannedLaps, postedLaps, readPostedLaps } from "./run-laps";

const intervals = endurancePrescriptionSchema.parse({
  prescriptionVersion: 1,
  sport: "running",
  nodes: [
    {
      kind: "step",
      id: "warm",
      phase: "warmup",
      action: "run",
      target: { kind: "duration", ms: [900_000, 900_000] },
    },
    {
      kind: "repeat",
      id: "reps",
      repetitions: 3,
      restBetweenMs: 90_000,
      steps: [
        {
          kind: "step",
          id: "rep",
          phase: "work",
          action: "run",
          target: { kind: "distance", metres: [800, 800], unit: "m" },
          paceSecondsPerKm: [245, 255],
        },
      ],
    },
    {
      kind: "step",
      id: "cool",
      phase: "cooldown",
      action: "run",
      target: { kind: "distance", metres: [2000, 2000] },
    },
  ],
});

describe("laps laid out from a plan", () => {
  it("gives a lap per step and per rest between reps, in order", () => {
    expect(plannedLaps(intervals, "km")).toEqual([
      { phase: "warmup", asked: { durationMs: 900_000 } },
      { phase: "work", asked: { distanceValue: 800, distanceUnit: "m" } },
      { phase: "recovery", asked: { durationMs: 90_000 } },
      { phase: "work", asked: { distanceValue: 800, distanceUnit: "m" } },
      { phase: "recovery", asked: { durationMs: 90_000 } },
      { phase: "work", asked: { distanceValue: 800, distanceUnit: "m" } },
      { phase: "cooldown", asked: { distanceValue: 2, distanceUnit: "km" } },
    ]);
  });

  it("says a longer step in the athlete's own unit", () => {
    expect(plannedLaps(intervals, "mi").at(-1)).toEqual({
      phase: "cooldown",
      asked: { distanceValue: 1.24, distanceUnit: "mi" },
    });
  });

  it("has nothing to lay out for a session without steps", () => {
    const easy = endurancePrescriptionSchema.parse({
      prescriptionVersion: 1,
      sport: "running",
      sessionTargets: { distanceMetres: [8000, 8000] },
    });
    expect(plannedLaps(easy, "km")).toEqual([]);
    expect(plannedLaps(null, "km")).toEqual([]);
  });
});

describe("laps posted and read back", () => {
  it("round-trips a saved run's laps in the units they were typed in", () => {
    const posted = postedLaps([
      {
        phase: "work",
        distance: nativeDistance(0.5, "mi"),
        durationMs: 180_000,
        averageHeartRate: 171,
        maxHeartRate: 180,
      },
      {
        phase: null,
        distance: null,
        durationMs: 60_000,
        averageHeartRate: null,
        maxHeartRate: null,
      },
    ]);
    expect(readPostedLaps(JSON.stringify(posted))).toEqual(posted);
    expect(posted[1]!.distanceUnit).toBe("m");
  });

  it("drops what it cannot read rather than failing the form", () => {
    expect(readPostedLaps("not json")).toEqual([]);
    expect(readPostedLaps(JSON.stringify([{ phase: "sprint", distanceValue: "x" }]))).toEqual([
      {
        phase: null,
        distanceValue: null,
        distanceUnit: "m",
        durationMs: null,
        averageHeartRate: null,
        maxHeartRate: null,
      },
    ]);
  });
});
