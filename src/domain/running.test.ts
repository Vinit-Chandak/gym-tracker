import { describe, expect, it } from "vitest";

import {
  shinEscalations,
  volumeSpike,
  weeklyVolumes,
  weekStart,
  type ShinReadings,
} from "./running";

describe("weekly run volume", () => {
  it("groups runs into Monday–Sunday weeks, newest first", () => {
    // 2026-09-07 is a Monday, 2026-09-13 the Sunday that ends the same week.
    expect(weekStart("2026-09-07")).toBe("2026-09-07");
    expect(weekStart("2026-09-13")).toBe("2026-09-07");
    expect(weekStart("2026-09-14")).toBe("2026-09-14");
    expect(weekStart("2026-09-06")).toBe("2026-08-31");
    const runs = [
      { startedOn: "2026-09-09", durationSeconds: 25 * 60, distanceMeters: 4000 },
      { startedOn: "2026-09-12", durationSeconds: 30 * 60, distanceMeters: 4750 },
      { startedOn: "2026-09-16", durationSeconds: 25 * 60, distanceMeters: 4100 },
    ];
    const weeks = weeklyVolumes(runs, "2026-09-17");
    expect(weeks).toEqual([
      { weekStart: "2026-09-14", runs: 1, minutes: 25, km: 4.1 },
      { weekStart: "2026-09-07", runs: 2, minutes: 55, km: 8.8 },
    ]);
  });

  it("keeps Sunday in the prior week and rolls over on Monday", () => {
    const volumes = weeklyVolumes(
      [
        { startedOn: "2026-09-13", durationSeconds: 1200, distanceMeters: 3000 },
        { startedOn: "2026-09-14", durationSeconds: 1800, distanceMeters: 5000 },
      ],
      "2026-09-14",
    );
    expect(volumes.map((w) => [w.weekStart, w.minutes, w.km])).toEqual([
      ["2026-09-14", 30, 5],
      ["2026-09-07", 20, 3],
    ]);
  });

  it("flags a week that already exceeds last week by more than 30%", () => {
    const last = { weekStart: "2026-09-07", runs: 2, minutes: 50, km: 8 };
    expect(volumeSpike({ weekStart: "2026-09-14", runs: 2, minutes: 60, km: 10 }, last)).toBeNull();
    expect(volumeSpike({ weekStart: "2026-09-14", runs: 3, minutes: 70, km: 12 }, last)).toEqual({
      thisWeekMinutes: 70,
      lastWeekMinutes: 50,
      ratio: 1.4,
    });
    expect(
      volumeSpike(
        { weekStart: "2026-09-15", runs: 3, minutes: 70, km: 12 },
        { weekStart: "2026-09-08", runs: 0, minutes: 0, km: 0 },
      ),
    ).toBeNull();
  });
});

function reading(
  leftPre: number | null,
  leftPeak: number | null,
  rightPre: number | null = 0,
  rightPeak: number | null = 0,
): ShinReadings {
  return {
    shinLeftPre: leftPre,
    shinLeftDuring: null,
    shinLeftPost: leftPeak,
    shinRightPre: rightPre,
    shinRightDuring: rightPeak,
    shinRightPost: null,
  };
}

describe("shin escalation", () => {
  it("needs three runs and a side that rose on each of them", () => {
    expect(shinEscalations([reading(1, 3), reading(1, 3)])).toEqual([]);
    expect(shinEscalations([reading(1, 3), reading(1, 2), reading(0, 1)])).toEqual([
      { side: "left", pattern: "rising", runs: 3 },
    ]);
    expect(shinEscalations([reading(1, 3), reading(1, 1), reading(0, 1)])).toEqual([]);
    expect(shinEscalations([reading(null, 3), reading(1, 3), reading(0, 1)])).toEqual([]);
  });

  it("also flags an after-run score that climbs run after run", () => {
    expect(shinEscalations([reading(2, 5), reading(3, 4), reading(3, 3)])).toEqual([
      { side: "left", pattern: "worsening", runs: 3 },
    ]);
    expect(
      shinEscalations([reading(0, 0, 1, 4), reading(0, 0, 1, 3), reading(0, 0, 1, 2)]),
    ).toEqual([{ side: "right", pattern: "rising", runs: 3 }]);
  });
});
