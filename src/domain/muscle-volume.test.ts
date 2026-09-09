import { describe, expect, it } from "vitest";

import { muscleVolume, volumeStep, SECONDARY_SET_WEIGHT } from "./muscle-volume";

describe("muscle volume", () => {
  it("counts primary muscles fully and secondary at half", () => {
    const v = muscleVolume([
      { primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "front_delts"], workingSets: 4 },
    ]);
    expect(v.chest).toBe(4);
    expect(v.triceps).toBe(2);
    expect(v.front_delts).toBe(2);
    expect(v.lats).toBe(0);
    expect(SECONDARY_SET_WEIGHT).toBe(0.5);
  });

  it("adds across exercises", () => {
    const v = muscleVolume([
      { primaryMuscles: ["lats"], secondaryMuscles: ["biceps"], workingSets: 3 },
      { primaryMuscles: ["biceps"], secondaryMuscles: [], workingSets: 2 },
    ]);
    expect(v.lats).toBe(3);
    // 3 sets of rows at half, plus 2 sets of curls at full.
    expect(v.biceps).toBe(3.5);
  });

  it("never double-counts a muscle listed as both primary and secondary", () => {
    const v = muscleVolume([
      { primaryMuscles: ["quads", "quads"], secondaryMuscles: ["quads", "glutes"], workingSets: 5 },
    ]);
    expect(v.quads).toBe(5);
    expect(v.glutes).toBe(2.5);
  });

  it("ignores unknown muscle names and empty sets", () => {
    const v = muscleVolume([
      { primaryMuscles: ["not_a_muscle"], secondaryMuscles: [], workingSets: 9 },
      { primaryMuscles: ["chest"], secondaryMuscles: [], workingSets: 0 },
    ]);
    expect(Object.values(v).every((n) => n === 0)).toBe(true);
  });

  it("bands sets the same way every week", () => {
    expect(volumeStep(0)).toBe(0);
    expect(volumeStep(0.5)).toBe(1);
    expect(volumeStep(4)).toBe(1);
    expect(volumeStep(5)).toBe(2);
    expect(volumeStep(9.5)).toBe(2);
    expect(volumeStep(10)).toBe(3);
    expect(volumeStep(14)).toBe(3);
    expect(volumeStep(15)).toBe(4);
    expect(volumeStep(40)).toBe(4);
  });
});
