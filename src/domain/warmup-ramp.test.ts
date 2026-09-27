import { describe, expect, it } from "vitest";

import type { PerformedSet } from "./progression";
import { readPerformance } from "./warmup-ramp";

/** The house warm-up's first compound ramp, and three sets of the work, on a 100 kg squat. */
const RAMP = [40, 57.5, 72.5];
const WORK = [100, 100, 100];

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
/** Each set as the rule reads it: W warm-up, B back-off, or the load of a working set. */
const read = (sets: PerformedSet[], options: Parameters<typeof readPerformance>[1] = {}) =>
  readPerformance(sets, options).map((set) =>
    set.setType === "warmup"
      ? `W${set.weight}`
      : set.setType === "backoff"
        ? `B${set.weight}`
        : `${set.weight}`,
  );

describe("readPerformance", () => {
  it("reads a ramp in front of the work as the warm-up, however many sets either had", () => {
    expect(read(logged([...RAMP, ...WORK]))).toEqual([
      "W40",
      "W57.5",
      "W72.5",
      "100",
      "100",
      "100",
    ]);
    // One warm-up fewer, one more, and a heavy last one at 90% of the work.
    expect(read(logged([40, 72.5, ...WORK]))).toEqual(["W40", "W72.5", "100", "100", "100"]);
    expect(read(logged([...RAMP, 85, ...WORK]))).toEqual([
      "W40",
      "W57.5",
      "W72.5",
      "W85",
      "100",
      "100",
      "100",
    ]);
    expect(read(logged([...RAMP, 90, ...WORK]))[3]).toBe("W90");
    // Fewer working sets than the slot asks for: the count says nothing about what was ramp.
    expect(read(logged([...RAMP, 100, 100]))).toEqual(["W40", "W57.5", "W72.5", "100", "100"]);
  });

  it("says what each set was logged as, and leaves the weights exactly as they were", () => {
    const sets = readPerformance(logged([...RAMP, ...WORK]));
    expect(sets.map((set) => set.loggedAs)).toEqual([
      "working",
      "working",
      "working",
      undefined,
      undefined,
      undefined,
    ]);
    expect(sets.map((set) => set.weight)).toEqual([...RAMP, ...WORK]);
  });

  it("reads a back-off after the work as a back-off, and a small drop as the work", () => {
    expect(read(logged([...WORK, 80]))).toEqual(["100", "100", "100", "B80"]);
    // Two sets at 100 and a third the athlete dropped to 80: two sets of work, not three.
    expect(read(logged([100, 100, 80]))).toEqual(["100", "100", "B80"]);
    // Fatigue taking off a plate or two is still the work.
    expect(read(logged([100, 97.5, 95]))).toEqual(["100", "97.5", "95"]);
    // A light set logged after the work started is a back-off, not a warm-up.
    expect(read(logged([100, 60, 100, 100]))).toEqual(["100", "B60", "100", "100"]);
  });

  it("keeps every step of a pyramid the session's plan prescribed", () => {
    expect(read(logged([80, 90, 100]), { planned: [80, 90, 100] })).toEqual(["80", "90", "100"]);
    expect(read(logged([80, 90, 100, 100]), { planned: [80, 90, 100] })).toEqual([
      "80",
      "90",
      "100",
      "100",
    ]);
    // With the ramp in front of it, the ramp is still the warm-up.
    expect(read(logged([40, 60, 80, 90, 100]), { planned: [80, 90, 100] })).toEqual([
      "W40",
      "W60",
      "80",
      "90",
      "100",
    ]);
    // Without a plan the prescription is straight sets, and the work is the top.
    expect(read(logged([80, 90, 100]))).toEqual(["W80", "W90", "100"]);
  });

  it("changes nothing in straight sets, and keeps what the athlete marked", () => {
    const straight = logged(WORK);
    expect(readPerformance(straight)).toEqual(straight);
    const marked = logged([20, ...RAMP, ...WORK], [{ setType: "warmup" }]);
    expect(read(marked)).toEqual(["W20", "W40", "W57.5", "W72.5", "100", "100", "100"]);
    expect(readPerformance(marked)[0]!.loggedAs).toBeUndefined();
    const backOff = logged([...WORK, 80], [{}, {}, {}, { setType: "backoff" }]);
    expect(readPerformance(backOff)[3]!.loggedAs).toBeUndefined();
  });

  it("never reads anything into a set nobody weighed", () => {
    expect(read(logged([null, 57.5, 72.5, ...WORK]))).toEqual([
      "null",
      "W57.5",
      "W72.5",
      "100",
      "100",
      "100",
    ]);
    expect(read(logged([null, null, null]))).toEqual(["null", "null", "null"]);
    expect(readPerformance([])).toEqual([]);
  });

  it("reads bodyweight, units and assisted machines the way their loads work", () => {
    expect(read(logged([0, 0, 0]))).toEqual(["0", "0", "0"]);
    expect(read(logged([0, 10, 20, 20, 20]))).toEqual(["W0", "W10", "20", "20", "20"]);
    // 220.46 lb is 99.998 kg: the same load, logged in another unit.
    expect(read(logged([99.998, 100, 100]))).toEqual(["99.998", "100", "100"]);
    const pounds = logged([88.2, 126.8, 159.8, ...WORK]);
    const inKg = (set: PerformedSet) =>
      set.weight === null ? null : set.setIndex <= 3 ? set.weight / 2.2046 : set.weight;
    expect(readPerformance(pounds, { load: inKg }).filter((set) => set.loggedAs)).toHaveLength(3);
    // Assisted: more help is easier, so the ramp comes down the numbers.
    expect(read(logged([50, 40, 30, 30, 30]), { assisted: true })).toEqual([
      "W50",
      "W40",
      "30",
      "30",
      "30",
    ]);
    expect(read(logged([20, 0, 0, 0]), { assisted: true })).toEqual(["W20", "0", "0", "0"]);
    expect(read(logged([30, 30, 30, 40]), { assisted: true })).toEqual(["30", "30", "30", "B40"]);
  });
});
