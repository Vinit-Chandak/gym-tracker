import { describe, expect, it } from "vitest";

import { MUSCLE_SPLIT_GROUP, muscleSplit, splitGroupOf, SPLIT_GROUPS } from "./muscle-split";
import { DEFAULT_PERIOD, periodBounds } from "./period";
import { MUSCLE_GROUPS } from "./types";

describe("muscleSplit", () => {
  it("maps every muscle group to one of the six axes", () => {
    for (const muscle of MUSCLE_GROUPS) {
      expect(SPLIT_GROUPS).toContain(MUSCLE_SPLIT_GROUP[muscle]);
    }
    expect(MUSCLE_SPLIT_GROUP.lower_back).toBe("Back");
    expect(MUSCLE_SPLIT_GROUP.hip_flexors).toBe("Legs");
    expect(MUSCLE_SPLIT_GROUP.forearms).toBe("Arms");
    expect(MUSCLE_SPLIT_GROUP.obliques).toBe("Core");
  });
  it("files an exercise under one axis, its first primary muscle's", () => {
    // A squat works quads, glutes and more: one axis, legs, never three.
    expect(splitGroupOf(["quads", "glutes", "hamstrings"])).toBe("Legs");
    expect(splitGroupOf(["chest", "triceps"])).toBe("Chest");
    expect(splitGroupOf(["gills", "lats"])).toBe("Back");
    expect(splitGroupOf([])).toBeNull();
  });
  it("shares sum to one", () => {
    const split = muscleSplit({ Chest: 6, Arms: 5, Back: 4, Legs: 5 });
    expect(Object.values(split).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(split.Chest).toBeCloseTo(0.3, 3);
    expect(split.Arms).toBeCloseTo(0.25, 3);
    expect(split.Shoulders).toBe(0);
  });
  it("is all zeros with nothing trained, and ignores an axis it does not know", () => {
    expect(muscleSplit({})).toEqual({
      Back: 0,
      Chest: 0,
      Core: 0,
      Shoulders: 0,
      Arms: 0,
      Legs: 0,
    });
    expect(muscleSplit({ Neck: 4, Chest: 4 } as never).Chest).toBe(1);
  });
});

describe("periodBounds", () => {
  it("ends today and counts today as one of the days", () => {
    expect(periodBounds("7d", "2026-09-15")).toEqual({ from: "2026-09-09", to: "2026-09-15" });
    expect(periodBounds(DEFAULT_PERIOD, "2026-03-01")).toEqual({
      from: "2026-01-31",
      to: "2026-03-01",
    });
    expect(periodBounds("1y", "2026-09-15")).toEqual({ from: "2025-09-16", to: "2026-09-15" });
  });
});
