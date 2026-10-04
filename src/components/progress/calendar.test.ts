import { describe, expect, it } from "vitest";

import {
  dayParts,
  monthDays,
  monthEnd,
  monthsBetween,
  saidOf,
  tally,
  tallyDistance,
  tallyName,
  type DayActivity,
} from "./calendar";

const activity = (patch: Partial<DayActivity>): DayActivity => ({
  sport: "strength",
  occurredOn: "2026-09-04",
  durationMs: null,
  distanceMetres: null,
  environment: null,
  ...patch,
});

describe("a day, read out", () => {
  it("says each activity as the calendar names it", () => {
    expect(saidOf(activity({ durationMs: 42 * 60_000 }))).toBe("lifting 42 min");
    expect(
      saidOf(activity({ sport: "running", distanceMetres: 3000, environment: "treadmill" })),
    ).toBe("run 3 km indoors");
    expect(saidOf(activity({ sport: "cycling", distanceMetres: 25_000 }))).toBe("ride 25 km");
    expect(saidOf(activity({ sport: "cycling", durationMs: 30 * 60_000 }))).toBe("ride 30 min");
    expect(saidOf(activity({ sport: "swimming", distanceMetres: 1500 }))).toBe("swim 1,500 m");
  });
});

describe("the month", () => {
  // Fri 4 Sept (the audit's September): a run, then a lift.
  const september = [
    activity({ sport: "running", distanceMetres: 3100 }),
    activity({ durationMs: 48 * 60_000 }),
    activity({ occurredOn: "2026-09-25", sport: "swimming", distanceMetres: 1500 }),
    activity({ occurredOn: "2026-08-31" }),
  ];

  it("puts each day's marks in its cell, in the order they were done", () => {
    const days = monthDays(september, "2026-09");
    expect(Object.keys(days)).toEqual(["4", "25"]);
    expect(days[4]).toEqual([
      { sport: "run", said: "run 3.1 km" },
      { sport: "strength", said: "lifting 48 min" },
    ]);
  });

  it("counts each sport and its distance, in the legend's order", () => {
    expect(tally(september.slice(0, 3))).toEqual([
      { sport: "strength", count: 1, metres: null },
      { sport: "running", count: 1, metres: 3100 },
      { sport: "swimming", count: 1, metres: 1500 },
    ]);
    expect(tallyName("running", 8)).toBe("Runs");
    expect(tallyName("cycling", 1)).toBe("Ride");
    expect(tallyDistance(30_800)).toBe("30.8 km");
  });

  it("walks the months between two dates", () => {
    expect(monthsBetween("2025-11-20", "2026-02-03")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
    expect(monthEnd("2026-02")).toBe("2026-02-28");
    expect(monthEnd("2026-09")).toBe("2026-09-30");
  });
});

describe("a day's print", () => {
  it("draws what was done in the day's order, two workouts as one block", () => {
    // Fri 25 Sept (Day board): a run, a swim, then the lift.
    const parts = dayParts([
      { sport: "running" },
      { sport: "swimming" },
      { sport: "strength", columns: [{ sets: 3, done: 3, warm: 1 }] },
      { sport: "strength", columns: [{ sets: 2, done: 2 }] },
    ]);
    expect(parts).toEqual([
      { kind: "run", state: "done" },
      { kind: "swim", state: "done" },
      {
        kind: "strength",
        columns: [
          { sets: 3, done: 3, warm: 1 },
          { sets: 2, done: 2 },
        ],
      },
    ]);
  });
});
