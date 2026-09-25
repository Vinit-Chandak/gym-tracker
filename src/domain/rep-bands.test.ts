import { describe, expect, it } from "vitest";

import { EXERCISES } from "@/db/seed/data/exercises";

import {
  bandDistance,
  bandEmphasis,
  defaultBand,
  exerciseRole,
  REP_BANDS,
  repBandTable,
  tooNarrowToProgress,
} from "./rep-bands";

/** A library row as the database holds it: an unstated measure is counted in reps. */
const LIBRARY = EXERCISES.map((exercise) => ({
  ...exercise,
  defaultPrescriptionType: exercise.measure ?? ("reps" as const),
}));

const bySlug = (slug: string) => {
  const exercise = LIBRARY.find((entry) => entry.slug === slug);
  if (!exercise) throw new Error(`No library exercise ${slug}`);
  return exercise;
};

describe("exercise roles", () => {
  it("reads a role from what the library already records", () => {
    expect(exerciseRole(bySlug("high-bar-squat"))).toBe("main_compound");
    expect(exerciseRole(bySlug("barbell-bench-press"))).toBe("main_compound");
    expect(exerciseRole(bySlug("pull-up"))).toBe("free_compound");
    expect(exerciseRole(bySlug("leg-press-45"))).toBe("machine_compound");
    expect(exerciseRole(bySlug("bayesian-cable-curl"))).toBe("isolation");
    expect(exerciseRole(bySlug("db-lateral-raise"))).toBe("small_isolation");
    expect(exerciseRole(bySlug("standing-calf-raise-machine"))).toBe("small_isolation");
    expect(exerciseRole(bySlug("cable-crunch"))).toBe("trunk");
    expect(exerciseRole(bySlug("pallof-press"))).toBe("trunk");
    expect(exerciseRole(bySlug("farmers-carry"))).toBe("timed_or_distance");
  });

  it("gives every rep exercise in the library a band, and nothing timed one", () => {
    for (const exercise of LIBRARY) {
      const band = defaultBand(exercise, "balanced");
      if (exercise.defaultPrescriptionType !== "reps") expect(band.reps).toBeNull();
      else if (band.role !== "not_resistance") expect(band.reps).not.toBeNull();
    }
  });
});

describe("bands", () => {
  it("puts the main lifts in the strength band when strength comes first or shares the goal", () => {
    const squat = bySlug("high-bar-squat");
    expect(defaultBand(squat, "strength").reps).toEqual([3, 6]);
    expect(defaultBand(squat, "balanced").reps).toEqual([3, 6]);
    expect(defaultBand(squat, "muscle").reps).toEqual([6, 10]);
    // Accessories stay in the muscle band unless strength is the whole goal.
    expect(defaultBand(bySlug("bayesian-cable-curl"), "balanced").reps).toEqual([10, 15]);
    expect(defaultBand(bySlug("bayesian-cable-curl"), "strength").reps).toEqual([8, 12]);
  });

  it("keeps every band inside what the training reference supports, and wide enough to build reps", () => {
    for (const band of Object.values(REP_BANDS)) {
      for (const range of [band.strength, band.muscle]) {
        expect(range[0]).toBeGreaterThanOrEqual(3);
        expect(range[1]).toBeLessThanOrEqual(30);
        expect(range[1] - range[0]).toBeGreaterThanOrEqual(3);
      }
      expect(band.rir[0]).toBeGreaterThanOrEqual(0);
      expect(band.rir[1]).toBeLessThanOrEqual(3);
      expect(Number.isInteger(band.rir[0]) && Number.isInteger(band.rir[1])).toBe(true);
    }
  });

  it("reads a goal as an emphasis", () => {
    expect(bandEmphasis("get_stronger")).toBe("strength");
    expect(bandEmphasis("build_muscle")).toBe("muscle");
    expect(bandEmphasis("lose_fat")).toBe("balanced");
    expect(bandEmphasis(null)).toBe("balanced");
  });

  it("measures how far a range sits outside its band", () => {
    expect(bandDistance([8, 12], [8, 12])).toBe(0);
    expect(bandDistance([6, 8], [8, 12])).toBe(2);
    expect(bandDistance([12, 20], [10, 15])).toBe(5);
  });

  it("allows a fixed target only where load does the progressing", () => {
    expect(tooNarrowToProgress("main_compound", [5, 5])).toBe(false);
    expect(tooNarrowToProgress("isolation", [10, 10])).toBe(true);
    expect(tooNarrowToProgress("isolation", [10, 11])).toBe(true);
    expect(tooNarrowToProgress("isolation", [10, 12])).toBe(false);
  });

  it("is given to the coach as one small table with its version", () => {
    const table = repBandTable("balanced");
    expect(table.roles).toHaveLength(Object.keys(REP_BANDS).length);
    expect(table.roles.find((role) => role.role === "main_compound")?.reps).toEqual([3, 6]);
    expect(table.version).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });
});
