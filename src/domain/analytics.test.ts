import { describe, expect, it } from "vitest";

import { trainingAnalytics } from "./analytics";
import type { TrainingData } from "@/server/repositories/training-data";

const TZ = "Europe/London";
const MONDAY = new Date("2026-09-21T09:00:00Z"); // today, Mon 21 Sep 2026

/** Runs alone exercise the weekly buckets; a workout needs a whole session tree to build. */
const withRuns = (days: readonly string[]): TrainingData =>
  ({
    workouts: [],
    runs: days.map((day) => ({
      startedAt: new Date(`${day}T07:00:00Z`),
      // Weeks are bucketed on the date frozen on the run, not recomputed from the instant.
      occurredOn: day,
      distanceMeters: 5000,
      durationSeconds: 1800,
      averagePaceSecondsPerKm: 360,
      environment: "outdoor",
    })),
    recovery: [],
    truncated: false,
  }) as unknown as TrainingData;

describe("weekly buckets", () => {
  it("stops at the last week with training rather than at today", () => {
    // Six runs in the week to Sun 20 Sep, nothing since: the window still runs to today.
    const data = withRuns([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
    ]);
    const { weeks } = trainingAnalytics(data, TZ, "2026-06-29", "2026-09-21", MONDAY);

    expect(weeks[weeks.length - 1]!.date).toBe("2026-09-14");
    expect(weeks[weeks.length - 1]!.runs).toBe(6);
    // The week that is still running is gone, not drawn as a zero on the floor.
    expect(weeks.some((w) => w.date === "2026-09-21")).toBe(false);
  });

  it("keeps a quiet week between two busy ones", () => {
    const data = withRuns(["2026-09-01", "2026-09-15"]);
    const { weeks } = trainingAnalytics(data, TZ, "2026-08-31", "2026-09-21", MONDAY);

    expect(weeks.map((w) => w.date)).toEqual(["2026-08-31", "2026-09-07", "2026-09-14"]);
    expect(weeks[1]!.runs).toBe(0);
  });

  it("keeps the running week once there is something in it, and marks it", () => {
    const data = withRuns(["2026-09-15", "2026-09-21"]);
    const { weeks } = trainingAnalytics(data, TZ, "2026-08-31", "2026-09-21", MONDAY);

    const last = weeks[weeks.length - 1]!;
    expect(last.date).toBe("2026-09-21");
    expect(last.runs).toBe(1);
    expect(last.partial).toBe(true);
    // Every week behind it is whole.
    expect(weeks.slice(0, -1).every((w) => w.partial)).toBe(false);
    expect(weeks.find((w) => w.date === "2026-09-14")!.partial).toBe(false);
  });

  it("marks a week the window opens part-way through", () => {
    const data = withRuns(["2026-09-02", "2026-09-15"]);
    const { weeks } = trainingAnalytics(data, TZ, "2026-09-01", "2026-09-21", MONDAY);

    // The bucket is Mon 31 Aug but the window opens on Tue 1 Sep: six days of seven.
    expect(weeks[0]!.date).toBe("2026-08-31");
    expect(weeks[0]!.partial).toBe(true);
  });

  it("returns nothing at all when nothing was logged", () => {
    const { weeks } = trainingAnalytics(withRuns([]), TZ, "2026-06-29", "2026-09-21", MONDAY);
    expect(weeks).toEqual([]);
  });

  it("treats a window that ended in the past as finished", () => {
    const data = withRuns(["2026-08-11"]);
    const { weeks } = trainingAnalytics(data, TZ, "2026-08-10", "2026-08-16", MONDAY);
    expect(weeks).toHaveLength(1);
    expect(weeks[0]!.partial).toBe(false);
  });
});
