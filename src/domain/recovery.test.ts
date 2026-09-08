import { describe, expect, it } from "vitest";

import { hasCheckIn, recoveryWarnings, type CheckIn } from "./recovery";

const blank: CheckIn = {
  sleepHours: null,
  sleepQuality: null,
  energy: null,
  fatigue: null,
  soreness: null,
  backPainPre: null,
  shinLeftPre: null,
  shinRightPre: null,
};

describe("recovery warnings", () => {
  it("is silent for a good check-in and for no check-in", () => {
    expect(recoveryWarnings(blank, null)).toEqual([]);
    expect(hasCheckIn(blank)).toBe(false);
    const good = { ...blank, sleepHours: 7, sleepQuality: 4, energy: 4, backPainPre: 1 };
    expect(recoveryWarnings(good, null)).toEqual([]);
  });

  it("warns on short sleep and worst-level readiness scores", () => {
    const codes = recoveryWarnings({ ...blank, sleepHours: 5.5, fatigue: 5 }, null).map(
      (w) => w.code,
    );
    expect(codes).toEqual(["short_sleep", "low_readiness"]);
    expect(recoveryWarnings({ ...blank, sleepHours: 6 }, null)).toEqual([]);
  });

  it("warns when a symptom rises two points or reaches five", () => {
    const rise = recoveryWarnings(
      { ...blank, backPainPre: 3, shinLeftPre: 2 },
      { ...blank, backPainPre: 1, shinLeftPre: 2 },
    );
    expect(rise.map((w) => w.code)).toEqual(["back_pain"]);
    expect(rise[0]?.title).toBe("Lower back 3/10, up from 1");

    const high = recoveryWarnings({ ...blank, shinRightPre: 5 }, null);
    expect(high.map((w) => w.code)).toEqual(["shin_pain"]);
    expect(high[0]?.title).toBe("Right shin 5/10");

    expect(recoveryWarnings({ ...blank, backPainPre: 4 }, { ...blank, backPainPre: 3 })).toEqual(
      [],
    );
  });
});
