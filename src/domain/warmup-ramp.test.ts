import { describe, expect, it } from "vitest";

import type { PerformedSet } from "./progression";
import { rampLength, readRampAsWarmups } from "./warmup-ramp";

/** The house warm-up's first compound ramp, and three sets of the work, on a 100 kg squat. */
const RAMP = [40, 57.5, 72.5];
const WORK = [100, 100, 100];

describe("rampLength", () => {
  it("reads the warm-up ramp in front of the prescribed working sets as the ramp", () => {
    expect(rampLength([...RAMP, ...WORK], 3)).toBe(3);
    // However long the ramp is, as long as the work is all there behind it.
    expect(rampLength([20, 40, 60, 80, ...WORK], 3)).toBe(4);
  });

  it("takes only as many sets as were logged beyond the prescription", () => {
    // A ramp followed by two working sets where the slot asks for three reads, set for set,
    // like a pyramid: the numbers alone only know that one set too many was logged.
    expect(rampLength([...RAMP, 100, 100], 3)).toBe(2);
  });

  it("takes as many more as the plan leads with warm-ups, but never a set of the work", () => {
    expect(rampLength([...RAMP, 100, 100], 3, { declared: 3 })).toBe(3);
    expect(rampLength([...RAMP, 100, 100], 3, { declared: 5 })).toBe(3);
    expect(rampLength([57.5, 100, 100], 3, { declared: 1 })).toBe(1);
    expect(rampLength(WORK, 3, { declared: 2 })).toBe(0);
  });

  it("leaves straight sets, a pyramid of the prescribed length and a back-off as they were", () => {
    expect(rampLength(WORK, 3)).toBe(0);
    expect(rampLength([100, 100, 100, 100], 3)).toBe(0);
    expect(rampLength([80, 90, 100], 3)).toBe(0);
    expect(rampLength([100, 100, 100, 80], 3)).toBe(0);
    // A ramp in front of a pyramid is still only the one set too many.
    expect(rampLength([60, 80, 90, 100], 3)).toBe(1);
  });

  it("stops at a load nobody weighed, and reads no ramp without loads", () => {
    expect(rampLength([null, 57.5, 72.5, ...WORK], 3)).toBe(0);
    expect(rampLength([40, null, 72.5, ...WORK], 3)).toBe(1);
    expect(rampLength([null, null, null, null], 3)).toBe(0);
    expect(rampLength([], 3)).toBe(0);
  });

  it("reads bodyweight as the lightest load and treats a rounding difference as the same load", () => {
    expect(rampLength([0, 0, 0, 0], 3)).toBe(0);
    expect(rampLength([0, 10, 20, 20, 20], 3)).toBe(2);
    // 220.46 lb is 99.998 kg: the same load, logged in another unit.
    expect(rampLength([99.998, 100, 100, 100], 3)).toBe(0);
  });

  it("counts less help as harder on an assisted machine", () => {
    expect(rampLength([50, 40, 30, 30, 30], 3, { assisted: true })).toBe(2);
    expect(rampLength([30, 30, 30, 40], 3, { assisted: true })).toBe(0);
    expect(rampLength([50, 40, 30, 30, 30], 3)).toBe(0);
  });
});

describe("readRampAsWarmups", () => {
  const logged = (weights: readonly (number | null)[], extra: Partial<PerformedSet>[] = []) =>
    weights.map((weight, index): PerformedSet => ({
      setIndex: index + 1,
      setType: "working",
      weight,
      reps: 5,
      rir: 2,
      durationSeconds: null,
      distanceMeters: null,
      ...extra[index],
    }));

  it("reads the ramp as warm-ups, says what each was logged as, and leaves the work alone", () => {
    const read = readRampAsWarmups(logged([...RAMP, ...WORK]), 3);
    expect(read.map((set) => [set.setType, set.loggedAs])).toEqual([
      ["warmup", "working"],
      ["warmup", "working"],
      ["warmup", "working"],
      ["working", undefined],
      ["working", undefined],
      ["working", undefined],
    ]);
    expect(read.map((set) => set.weight)).toEqual([...RAMP, ...WORK]);
  });

  it("counts only working sets against the prescription, in the order they were done", () => {
    // A warm-up the athlete did mark is already a warm-up, and is not one of the sets too many.
    const marked = logged([20, ...RAMP, ...WORK], [{ setType: "warmup" }]);
    expect(readRampAsWarmups(marked, 3).map((set) => set.setType)).toEqual([
      "warmup",
      "warmup",
      "warmup",
      "warmup",
      "working",
      "working",
      "working",
    ]);
    const shuffled = [...logged([...RAMP, ...WORK])].reverse();
    expect(
      readRampAsWarmups(shuffled, 3)
        .filter((set) => set.loggedAs)
        .map((set) => set.setIndex)
        .sort(),
    ).toEqual([1, 2, 3]);
  });

  it("returns the performance unchanged when nothing in it is a ramp", () => {
    const straight = logged(WORK);
    expect(readRampAsWarmups(straight, 3)).toEqual(straight);
  });

  it("compares the loads it is given, so sets in different units compare as one", () => {
    const pounds = logged([88.2, 126.8, 159.8, ...WORK]);
    const inKg = (set: PerformedSet) =>
      set.weight === null ? null : set.setIndex <= 3 ? set.weight / 2.2046 : set.weight;
    expect(readRampAsWarmups(pounds, 3, { load: inKg }).filter((set) => set.loggedAs)).toHaveLength(
      3,
    );
  });
});
