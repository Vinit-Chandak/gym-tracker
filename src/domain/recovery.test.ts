import { describe, expect, it } from "vitest";

import { hasCheckIn, recoveryWarnings, type CheckIn } from "./recovery";

const blank: CheckIn = {
  sleepHours: null,
  sleepQuality: null,
  energy: null,
  fatigue: null,
  soreness: null,
};

describe("recovery warnings", () => {
  it("is silent for a good check-in and for no check-in", () => {
    expect(recoveryWarnings(blank)).toEqual([]);
    expect(hasCheckIn(blank)).toBe(false);
    expect(recoveryWarnings({ ...blank, sleepHours: 7, sleepQuality: 4, energy: 4 })).toEqual([]);
  });

  it("warns on short sleep and worst-level readiness scores", () => {
    const codes = recoveryWarnings({ ...blank, sleepHours: 5.5, fatigue: 5 }).map((w) => w.code);
    expect(codes).toEqual(["short_sleep", "low_readiness"]);
    expect(recoveryWarnings({ ...blank, sleepHours: 6 })).toEqual([]);
  });

  it("names every reading at its worst, and nothing in between", () => {
    const warnings = recoveryWarnings({
      ...blank,
      sleepQuality: 1,
      energy: 1,
      fatigue: 5,
      soreness: 5,
    });
    expect(warnings.map((w) => w.code)).toEqual(["low_readiness"]);
    expect(warnings[0]?.title).toBe("Worst score on sleep quality, energy, fatigue, soreness");
    expect(recoveryWarnings({ ...blank, sleepQuality: 2, energy: 2, fatigue: 4 })).toEqual([]);
  });
});
