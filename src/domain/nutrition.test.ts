import { describe, expect, it } from "vitest";

import {
  addUp,
  eaten,
  goalBand,
  goalStatus,
  KCAL_PER_GRAM,
  macroTargets,
  mealFromSlug,
  MEALS,
  mealSlug,
  overLimit,
  quickAmounts,
  roundTo,
  sameFoods,
  scaleFood,
  toHundredth,
  type Food,
  type LoggedFood,
  type NutritionTargets,
} from "./nutrition";

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

const OATS: Food = {
  name: "Oats",
  portionAmount: 100,
  unit: "g",
  kcal: 389,
  carbsG: 66.3,
  fatG: 6.9,
  proteinG: 16.9,
};

describe("a portion scaled", () => {
  it("scales every figure by the amount over the portion", () => {
    expect(scaleFood(OATS, 200)).toEqual({ kcal: 778, carbsG: 132.6, fatG: 13.8, proteinG: 33.8 });
    expect(scaleFood(OATS, 100)).toEqual({ kcal: 389, carbsG: 66.3, fatG: 6.9, proteinG: 16.9 });
  });

  it("rounds each figure to the tenth, an exact half up", () => {
    // 66.3 g × 60 / 100 is 39.78: floating point makes it 39.779999999999994.
    expect(scaleFood(OATS, 60)).toEqual({ kcal: 233.4, carbsG: 39.8, fatG: 4.1, proteinG: 10.1 });
    // 0.3 × 0.5 / 3 is exactly 0.05, which floating point puts a hair under.
    const tiny = { portionAmount: 3, kcal: 0.3, carbsG: null, fatG: null, proteinG: null };
    expect(0.3 * (0.5 / 3)).toBeLessThan(0.05);
    expect(scaleFood(tiny, 0.5).kcal).toBe(0.1);
  });

  it("keeps an unknown macronutrient unknown however much is eaten", () => {
    const takeaway = { ...OATS, portionAmount: 1, unit: "serving" as const, carbsG: null };
    expect(scaleFood(takeaway, 2)).toMatchObject({ kcal: 778, carbsG: null });
  });

  it("scales from any portion, in the food's own unit", () => {
    const whey = { portionAmount: 1, kcal: 139, carbsG: 5.6, fatG: 1.8, proteinG: 25 };
    expect(scaleFood(whey, 1.5)).toEqual({ kcal: 208.5, carbsG: 8.4, fatG: 2.7, proteinG: 37.5 });
    const milk = { portionAmount: 250, kcal: 225, carbsG: 20, fatG: 0.5, proteinG: 35 };
    expect(scaleFood(milk, 300)).toEqual({ kcal: 270, carbsG: 24, fatG: 0.6, proteinG: 42 });
  });

  it("reads what a logged food came to from its own copy", () => {
    const logged: LoggedFood = { ...OATS, foodId: null, amount: 50 };
    expect(eaten(logged)).toEqual({ kcal: 194.5, carbsG: 33.2, fatG: 3.5, proteinG: 8.5 });
  });

  it("rounds as the decimal that was typed, not the binary number nearest it", () => {
    expect(Math.round(1.255 * 100) / 100).toBe(1.25);
    expect(toHundredth(1.255)).toBe(1.26);
    expect(roundTo(2.675, 2)).toBe(2.68);
    expect(roundTo(0.05, 1)).toBe(0.1);
    expect(roundTo(1e-7, 2)).toBe(0);
    expect(Object.is(roundTo(-0.001, 2), -0)).toBe(false);
  });

  it("offers half, one, one and a half and two portions", () => {
    expect(quickAmounts(100)).toEqual([50, 100, 150, 200]);
    expect(quickAmounts(1)).toEqual([0.5, 1, 1.5, 2]);
    expect(quickAmounts(33.33)).toEqual([16.67, 33.33, 50, 66.66]);
  });

  it("names the figure a slipped finger takes past the bounds for one food", () => {
    expect(overLimit(OATS, 1500)).toBeNull();
    // 1,600 g of oats is 6,224 kcal, but 1,060.8 g of carbohydrate.
    expect(overLimit(OATS, 1600)).toBe("carbsG");
    const oil = { portionAmount: 100, kcal: 884, carbsG: null, fatG: null, proteinG: null };
    // 1,131 g of oil is 9,998 kcal; 1,132 g is 10,006.9.
    expect(overLimit(oil, 1131)).toBeNull();
    expect(overLimit(oil, 1132)).toBe("kcal");
    const whey = { portionAmount: 1, kcal: 100, carbsG: null, fatG: null, proteinG: 90 };
    expect(overLimit(whey, 12)).toBe("proteinG");
  });
});

describe("the day's meals", () => {
  it("run in the order they are eaten", () => {
    expect(MEALS).toEqual([
      "breakfast",
      "morning_snack",
      "lunch",
      "afternoon_snack",
      "dinner",
      "evening_snack",
    ]);
  });

  it("go into a URL and come back out of it", () => {
    expect(mealSlug("morning_snack")).toBe("morning-snack");
    for (const meal of MEALS) expect(mealFromSlug(mealSlug(meal))).toBe(meal);
    expect(mealFromSlug("morning_snack")).toBeNull();
    expect(mealFromSlug("brunch")).toBeNull();
  });
});

describe("a saved meal matched", () => {
  const logged = (food: Food, amount: number): LoggedFood => ({ ...food, foodId: null, amount });
  const MILK: Food = {
    name: "Milk",
    portionAmount: 100,
    unit: "ml",
    kcal: 52,
    carbsG: 5,
    fatG: 2.5,
    proteinG: 3.3,
  };

  it("holds the same foods in the same amounts, in any order and any capitals", () => {
    expect(
      sameFoods(
        [logged(OATS, 60), logged(MILK, 300)],
        [logged(MILK, 300), logged({ ...OATS, name: " oats " }, 60)],
      ),
    ).toBe(true);
  });

  it("is a meal of its own once a portion changes, or a food is added or corrected", () => {
    const saved = [logged(OATS, 60), logged(MILK, 300)];
    expect(sameFoods([logged(OATS, 80), logged(MILK, 300)], saved)).toBe(false);
    expect(sameFoods([...saved, logged(MILK, 100)], saved)).toBe(false);
    expect(sameFoods([logged({ ...OATS, kcal: 379 }, 60), logged(MILK, 300)], saved)).toBe(false);
    expect(sameFoods([], [])).toBe(true);
  });
});
