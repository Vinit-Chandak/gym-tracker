import { describe, expect, it } from "vitest";

import {
  difficultyChange,
  harderAllowance,
  knownLoads,
  ladderFor,
  stepDown,
  stepEasier,
  stepHarder,
  stepUp,
  stepsFrom,
  type LoadLadder,
} from "./load-steps";

const stack = (known: number[], assisted = false): LoadLadder => ({
  known,
  stack: true,
  assisted,
  increment: null,
});

describe("a stack's steps come from what has been lifted on it", () => {
  it("takes the next stop anybody has used, however uneven the stack is", () => {
    const legCurl = stack([47, 54, 59]);
    expect(stepUp(legCurl, 47)).toEqual({ load: 54, source: "known" });
    expect(stepUp(legCurl, 54)).toEqual({ load: 59, source: "known" });
    expect(stepDown(legCurl, 59)).toEqual({ load: 54, source: "known" });
  });

  it("above the heaviest stop, repeats the gap between the two heaviest", () => {
    expect(stepUp(stack([47, 54, 59]), 59)).toEqual({ load: 64, source: "learned" });
    // A stack whose plates grow near the top learns the top gap, not the bottom one.
    expect(stepUp(stack([5, 7.5, 10, 20, 30]), 30)).toEqual({ load: 40, source: "learned" });
  });

  it("knows nothing above a stack with only one stop logged", () => {
    expect(stepUp(stack([59]), 59)).toBeNull();
    expect(stepUp(stack([]), 20)).toBeNull();
    expect(stepDown(stack([59]), 59)).toBeNull();
  });

  it("ignores a typed jump on a stack", () => {
    expect(stepUp({ ...stack([59]), increment: 2.5 }, 59)).toBeNull();
  });

  it("mirrors the rule below the lightest stop, and never reaches zero", () => {
    expect(stepDown(stack([20, 25, 30]), 20)).toEqual({ load: 15, source: "learned" });
    expect(stepDown(stack([5, 10]), 5)).toBeNull();
  });
});

describe("plates and free weights keep the typed jump", () => {
  const legPress: LoadLadder = { known: [], stack: false, assisted: false, increment: 5 };
  it("steps by the increment, and snaps to a listed load where there is one", () => {
    expect(stepUp(legPress, 100)).toEqual({ load: 105, source: "increment" });
    expect(stepDown(legPress, 100)).toEqual({ load: 95, source: "increment" });
    expect(stepUp({ ...legPress, known: [100, 102.5] }, 100)).toEqual({
      load: 102.5,
      source: "known",
    });
  });
  it("has no step without an increment or a list", () => {
    expect(stepUp({ ...legPress, increment: null }, 100)).toBeNull();
  });
  it("only learns from logs on a stack", () => {
    const plates = ladderFor({
      resistanceMode: "plate_loaded",
      equipmentTypeSlug: "leg_press_45",
      availableLoads: [],
      loggedLoads: [100, 120],
      loadIncrement: 5,
    });
    expect(plates.known).toEqual([]);
    const pins = ladderFor({
      resistanceMode: "selectorized",
      equipmentTypeSlug: "leg_curl_seated",
      availableLoads: [64],
      loggedLoads: [59, 47, 54, 54],
      loadIncrement: 2.5,
    });
    expect(pins.known).toEqual([47, 54, 59, 64]);
    expect(pins.assisted).toBe(false);
  });
});

describe("assisted machines count the other way", () => {
  const pullUp = stack([20, 25, 30], true);
  it("gets harder by giving less help, and easier by giving more", () => {
    expect(stepHarder(pullUp, 25)).toEqual({ load: 20, source: "known" });
    expect(stepHarder(pullUp, 20)).toEqual({ load: 15, source: "learned" });
    expect(stepEasier(pullUp, 30)).toEqual({ load: 35, source: "learned" });
    expect(difficultyChange(pullUp, 25, 20)).toBeCloseTo(0.2);
  });
  it("recognises the assisted machines by their type", () => {
    const ladder = ladderFor({
      resistanceMode: "selectorized",
      equipmentTypeSlug: "assisted_pullup",
      availableLoads: [],
      loggedLoads: [],
      loadIncrement: null,
    });
    expect(ladder.assisted).toBe(true);
  });
});

describe("what a step harder is allowed to be", () => {
  const limit = 0.05;
  it("lets one real step through when the percentage alone would freeze the lift", () => {
    // 59 to the next stop, 64, is 8.5%, and it is the only step this stack has.
    expect(harderAllowance(limit, 59, stack([47, 54, 59]))).toBeCloseTo(5 / 59);
    const dumbbells: LoadLadder = { known: [], stack: false, assisted: false, increment: 2.5 };
    expect(harderAllowance(limit, 20, dumbbells)).toBeCloseTo(0.125);
  });
  it("leaves the percentage alone where the step is smaller, or unknown", () => {
    const barbell: LoadLadder = { known: [], stack: false, assisted: false, increment: 2.5 };
    expect(harderAllowance(limit, 100, barbell)).toBe(limit);
    expect(harderAllowance(limit, 59, stack([59]))).toBe(limit);
    expect(harderAllowance(limit, 59, null)).toBe(limit);
    expect(harderAllowance(limit, 0, barbell)).toBe(limit);
  });
});

it("gives a plan the next load either way from each load last used, and nothing more", () => {
  expect(knownLoads([5, 5.004, 0, -1, Number.NaN, 2.5])).toEqual([2.5, 5]);
  expect(stepsFrom(stack([47, 54, 59]), [47, 54, 59, null])).toEqual([
    {
      from: 47,
      harder: { load: 54, source: "known" },
      easier: { load: 40, source: "learned" },
    },
    {
      from: 54,
      harder: { load: 59, source: "known" },
      easier: { load: 47, source: "known" },
    },
    {
      from: 59,
      harder: { load: 64, source: "learned" },
      easier: { load: 54, source: "known" },
    },
  ]);
});
