import { describe, expect, it } from "vitest";

import { bodyWeightRatio, compareValues, strongerVerdict } from "./compare";

describe("compareValues", () => {
  it("says the difference from the viewer's side, relative to the friend", () => {
    expect(compareValues(6240, 5200)).toEqual({ leader: "a", percent: 20 });
    expect(compareValues(5200, 6240)).toEqual({ leader: "b", percent: -16.7 });
  });
  it("cannot give a percentage when a side has nothing, but still names a leader", () => {
    expect(compareValues(12, null)).toEqual({ leader: "a", percent: null });
    expect(compareValues(0, 12)).toEqual({ leader: "b", percent: null });
    expect(compareValues(null, 0)).toEqual({ leader: null, percent: null });
  });
  it("calls equal values equal", () => {
    expect(compareValues(80, 80)).toEqual({ leader: null, percent: 0 });
  });
  it("calls values closer than a tenth of a percent equal, never '↓ ='", () => {
    // These round to -0 and 0; one side leading by "=" would contradict itself.
    expect(compareValues(12345.6, 12350)).toEqual({ leader: null, percent: 0 });
    expect(compareValues(250.1, 250)).toEqual({ leader: null, percent: 0 });
    expect(Object.is(compareValues(250, 250.1).percent, 0)).toBe(true);
    expect(compareValues(250, 250.1, true)).toEqual({ leader: null, percent: 0 });
    // A difference the percentage can show still has a leader.
    expect(compareValues(1000, 999)).toEqual({ leader: "a", percent: 0.1 });
  });
  it("turns the leader around for a metric that improves downwards", () => {
    expect(compareValues(300, 325, true)).toEqual({ leader: "a", percent: -7.7 });
    // A missing time is not a fast one.
    expect(compareValues(300, null, true)).toEqual({ leader: "a", percent: null });
  });
});

describe("strongerVerdict", () => {
  it("names the leader on the primary metric and nobody on a tie", () => {
    expect(strongerVerdict(88, 85)).toBe("a");
    expect(strongerVerdict(85, 88)).toBe("b");
    expect(strongerVerdict(88, 88)).toBeNull();
    expect(strongerVerdict(null, null)).toBeNull();
    // Too close for the row beneath to tell apart: nobody is Stronger.
    expect(strongerVerdict(250.1, 250)).toBeNull();
  });
});

describe("bodyWeightRatio", () => {
  it("is the load over the body weight, to two places, or nothing", () => {
    expect(bodyWeightRatio(88, 74.5)).toBe(1.18);
    expect(bodyWeightRatio(88, null)).toBeNull();
    expect(bodyWeightRatio(88, 0)).toBeNull();
  });
});
