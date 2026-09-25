import { describe, expect, it } from "vitest";

import {
  addUp,
  goalBand,
  goalStatus,
  KCAL_PER_GRAM,
  macroTargets,
  partOfDay,
  suggestMealName,
  type NutritionTargets,
} from "./nutrition";
import { hourInTimeZone } from "./program-calendar";

const BY_WEIGHT: NutritionTargets = { dailyKcal: 2400, proteinPerKg: 1.8, split: "body_weight" };

/** The energy the three macronutrients of a target stand for. */
function energyOf(targets: { carbsG: number; fatG: number; proteinG: number }): number {
  return (
    targets.carbsG * KCAL_PER_GRAM.carbs +
    targets.fatG * KCAL_PER_GRAM.fat +
    targets.proteinG * KCAL_PER_GRAM.protein
  );
}

describe("macro targets", () => {
  it("takes protein from body weight, a quarter as fat, and the rest as carbohydrate", () => {
    const targets = macroTargets(BY_WEIGHT, 75);
    expect(targets.proteinG).toBeCloseTo(135); // 1.8 g × 75 kg
    expect(targets.fatG).toBeCloseTo(600 / 9); // 25% of 2,400 kcal
    expect(targets.carbsG).toBeCloseTo((2400 - 600 - 540) / 4);
    expect(energyOf(targets)).toBeCloseTo(2400);
    expect(targets).toMatchObject({ split: "body_weight", bodyWeightKg: 75, overBudget: false });
  });

  it("moves protein with the body weight, and carbohydrate with it", () => {
    const lighter = macroTargets(BY_WEIGHT, 70);
    const heavier = macroTargets(BY_WEIGHT, 80);
    expect(heavier.proteinG - lighter.proteinG).toBeCloseTo(18);
    expect(lighter.carbsG - heavier.carbsG).toBeCloseTo(18);
    expect(heavier.fatG).toBeCloseTo(lighter.fatG);
  });

  it("follows the grams per kilogram the account chose", () => {
    expect(macroTargets({ ...BY_WEIGHT, proteinPerKg: 2.2 }, 80).proteinG).toBeCloseTo(176);
  });

  it("keeps 55/25/20 as a split of its own, whatever the body weight", () => {
    const fixed = macroTargets({ ...BY_WEIGHT, split: "fixed_55_25_20" }, 75);
    expect(fixed.carbsG).toBeCloseTo((2400 * 0.55) / 4);
    expect(fixed.fatG).toBeCloseTo((2400 * 0.25) / 9);
    expect(fixed.proteinG).toBeCloseTo((2400 * 0.2) / 4);
    expect(energyOf(fixed)).toBeCloseTo(2400);
    expect(fixed).toMatchObject({ split: "fixed_55_25_20", bodyWeightKg: null });
  });

  it("falls back to the fixed split when there is no body weight to work from", () => {
    const targets = macroTargets(BY_WEIGHT, null);
    expect(targets.split).toBe("fixed_55_25_20");
    expect(targets.proteinG).toBeCloseTo(120);
  });

  it("never asks for negative carbohydrate, and says the target is too small instead", () => {
    // 2.2 g × 120 kg = 264 g of protein, 1,056 kcal, before fat takes its 25% of 1,200.
    const targets = macroTargets({ dailyKcal: 1200, proteinPerKg: 2.2, split: "body_weight" }, 120);
    expect(targets.carbsG).toBe(0);
    expect(targets.proteinG).toBeCloseTo(264);
    expect(targets.overBudget).toBe(true);
  });
});

describe("the goal band", () => {
  it("runs from 90% to 110% of the target", () => {
    expect(goalBand(2400)).toEqual({ low: 2160, high: 2640 });
  });

  it("keeps fractional ends so the displayed band agrees with the goal check", () => {
    // 90% of 2,345 is 2,110.5 and 110% is 2,579.5.
    expect(goalBand(2345)).toEqual({ low: 2110.5, high: 2579.5 });
  });

  it.each([
    [0, "under"],
    [2159.9, "under"],
    // Both ends are inside the band, exactly: no rounding error may push them out.
    [2160, "met"],
    [2400, "met"],
    [2640, "met"],
    [2640.1, "over"],
    [4000, "over"],
  ] as const)("reads %d kcal against 2,400 as %s", (eaten, status) => {
    expect(goalStatus(eaten, 2400)).toBe(status);
  });

  it("keeps the ends of a band that 0.9 and 1.1 cannot state exactly", () => {
    // 0.9 × 501 is 450.90000000000003 in floating point, so a plain comparison would put
    // exactly 90% of the target a hair under it.
    expect(0.9 * 501).toBeGreaterThan(450.9);
    expect(goalStatus(450.9, 501)).toBe("met");
    expect(goalStatus(450.8, 501)).toBe("under");
    expect(goalStatus(551.1, 501)).toBe("met");
    expect(goalStatus(551.2, 501)).toBe("over");
  });
});

describe("adding up", () => {
  it("counts a macronutrient nobody entered as none", () => {
    expect(
      addUp([
        { kcal: 440, carbsG: 15, fatG: 37, proteinG: 19 },
        { kcal: 900, carbsG: null, fatG: null, proteinG: null },
      ]),
    ).toEqual({ kcal: 1340, carbsG: 15, fatG: 37, proteinG: 19 });
  });

  it("adds tenths without floating-point drift", () => {
    const tenth = { kcal: 0.1, carbsG: 0.1, fatG: 0.2, proteinG: 0.3 };
    expect(addUp([tenth, tenth, tenth])).toEqual({
      kcal: 0.3,
      carbsG: 0.3,
      fatG: 0.6,
      proteinG: 0.9,
    });
  });

  it("comes to nothing for nothing", () => {
    expect(addUp([])).toEqual({ kcal: 0, carbsG: 0, fatG: 0, proteinG: 0 });
  });
});

describe("naming a meal", () => {
  it.each([
    [4, "Morning"],
    [11, "Morning"],
    [12, "Afternoon"],
    [16, "Afternoon"],
    [17, "Evening"],
    [21, "Evening"],
    [22, "Night"],
    [0, "Night"],
    [3, "Night"],
  ] as const)("calls %d o'clock %s", (hour, part) => {
    expect(partOfDay(hour)).toBe(part);
  });

  it("starts each part of the day at 1", () => {
    expect(suggestMealName([], 14)).toBe("Afternoon meal 1");
    expect(suggestMealName(["Morning meal 1", "Morning meal 2"], 14)).toBe("Afternoon meal 1");
  });

  it("takes the next number up, never one still in use", () => {
    expect(suggestMealName(["Afternoon meal 1"], 15)).toBe("Afternoon meal 2");
    // The first was deleted: a second "Afternoon meal 2" would be ambiguous.
    expect(suggestMealName(["Afternoon meal 2"], 15)).toBe("Afternoon meal 3");
    expect(suggestMealName(["afternoon meal 4", "Afternoon meal shake"], 15)).toBe(
      "Afternoon meal 5",
    );
  });
});

describe("the hour in a time zone", () => {
  it("reads the account's own clock, midnight included", () => {
    const instant = new Date("2026-09-25T18:40:00Z");
    expect(hourInTimeZone("UTC", instant)).toBe(18);
    expect(hourInTimeZone("Asia/Kolkata", instant)).toBe(0); // 00:10 the next day
    expect(hourInTimeZone("America/New_York", instant)).toBe(14);
  });
});
