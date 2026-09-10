import { describe, expect, it } from "vitest";

import { STRENGTH_AESTHETICS_HYBRID_8WK } from "@/db/seed/data/program";

import {
  BLUEPRINT_VERSION,
  blueprintExerciseSlugs,
  parseProgramBlueprint,
  prescriptionTypeOf,
} from "./program-blueprint";

/** The smallest thing that is still a programme, used as the base for each rejection case. */
function minimal(): Record<string, unknown> {
  return {
    blueprintVersion: BLUEPRINT_VERSION,
    slug: "test-plan",
    name: "Test plan",
    weeks: 4,
    days: [
      {
        dayIndex: 1,
        dayOfWeek: 1,
        name: "Full body",
        includesLifting: true,
        includesRun: false,
        warmupSlug: "lower",
        exercises: [
          { exerciseSlug: "high-bar-squat", sets: 3, reps: [5, 8], rir: [2, 3], rest: [120, 180] },
        ],
      },
    ],
  };
}

describe("programme blueprints", () => {
  it("fills in the optional text fields so callers never handle undefined", () => {
    const plan = parseProgramBlueprint(minimal());
    expect(plan.notes).toBe("");
    expect(plan.runs).toEqual([]);
    expect(plan.days[0]?.focus).toBe("");
  });

  it("insists on exactly one measure: reps, duration or distance", () => {
    const withBoth = minimal();
    // @ts-expect-error building an invalid document on purpose
    withBoth.days[0].exercises[0].duration = [30, 45];
    expect(() => parseProgramBlueprint(withBoth)).toThrow(/exactly one of reps/);

    const withDistanceToo = minimal();
    // @ts-expect-error building an invalid document on purpose
    withDistanceToo.days[0].exercises[0].distance = [20, 40];
    expect(() => parseProgramBlueprint(withDistanceToo)).toThrow(/exactly one of reps/);

    const withNeither = minimal();
    // @ts-expect-error building an invalid document on purpose
    delete withNeither.days[0].exercises[0].reps;
    expect(() => parseProgramBlueprint(withNeither)).toThrow(/exactly one of reps/);

    // A carry, which counts metres and has no reps to give, is a valid slot.
    const carry = minimal();
    // @ts-expect-error building a valid distance slot on purpose
    delete carry.days[0].exercises[0].reps;
    // @ts-expect-error building a valid distance slot on purpose
    carry.days[0].exercises[0].distance = [20, 40];
    const parsed = parseProgramBlueprint(carry);
    expect(prescriptionTypeOf(parsed.days[0]!.exercises[0]!)).toBe("distance");
  });

  it("rejects a backwards range, a repeated day and a run past the last week", () => {
    const backwards = minimal();
    // @ts-expect-error building an invalid document on purpose
    backwards.days[0].exercises[0].reps = [10, 4];
    expect(() => parseProgramBlueprint(backwards)).toThrow(/low to high/);

    const repeated = minimal();
    // @ts-expect-error building an invalid document on purpose
    repeated.days.push({ ...repeated.days[0] });
    expect(() => parseProgramBlueprint(repeated)).toThrow(/unique/i);

    const lateRun = minimal();
    lateRun.runs = [{ weekIndex: 9, dayOfWeek: 3, duration: [20, 30], rpe: [3, 4] }];
    expect(() => parseProgramBlueprint(lateRun)).toThrow(/outside a 4-week/);
  });

  it("rejects slugs that could not name a seeded row", () => {
    const bad = minimal();
    // @ts-expect-error building an invalid document on purpose
    bad.days[0].exercises[0].exerciseSlug = "High Bar Squat";
    expect(() => parseProgramBlueprint(bad)).toThrow(/lower-case/);
  });

  it("refuses a document from a future contract version", () => {
    expect(() => parseProgramBlueprint({ ...minimal(), blueprintVersion: 99 })).toThrow();
  });

  it("accepts the shipped template unchanged", () => {
    const parsed = parseProgramBlueprint(STRENGTH_AESTHETICS_HYBRID_8WK);
    expect(parsed.slug).toBe(STRENGTH_AESTHETICS_HYBRID_8WK.slug);
    expect(parsed.days).toHaveLength(7);
  });

  it("lists every exercise a plan needs, fallbacks included and duplicates collapsed", () => {
    const slugs = blueprintExerciseSlugs(STRENGTH_AESTHETICS_HYBRID_8WK);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toContain("high-bar-squat");
    // Only reachable as a fallback of the calf raise.
    expect(slugs).toContain("leg-press-calf-press");
  });

  it("reads the prescription kind off the entry", () => {
    const plan = parseProgramBlueprint(minimal());
    expect(prescriptionTypeOf(plan.days[0]!.exercises[0]!)).toBe("reps");

    const timedDocument = minimal();
    // @ts-expect-error swapping reps for a duration on an untyped document
    timedDocument.days[0].exercises = [
      { exerciseSlug: "side-plank", sets: 2, duration: [30, 45], rir: [1, 2], rest: [45, 60] },
    ];
    const timed = parseProgramBlueprint(timedDocument);
    expect(prescriptionTypeOf(timed.days[0]!.exercises[0]!)).toBe("duration");
  });
});
