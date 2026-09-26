import { describe, expect, it } from "vitest";

import {
  addUp,
  contributions,
  DEFAULT_SPLIT,
  eaten,
  GOAL_SPLITS,
  goalBand,
  goalStatus,
  KCAL_PER_GRAM,
  macroState,
  macroTargets,
  matchesSplit,
  mealFromSlug,
  MEALS,
  mealSlug,
  overLimit,
  quickAmounts,
  roundTo,
  sameFoods,
  scaleFood,
  splitFor,
  splitTargets,
  toHundredth,
  type Food,
  type LoggedFood,
  type Meal,
  type NutritionTargets,
} from "./nutrition";

const TARGETS: NutritionTargets = { dailyKcal: 2400, proteinPerKg: 1.8, fatPercent: 25 };

/** The energy the three macronutrients of a target stand for. */
function energyOf(targets: { carbsG: number; fatG: number; proteinG: number }): number {
  return (
    targets.carbsG * KCAL_PER_GRAM.carbs +
    targets.fatG * KCAL_PER_GRAM.fat +
    targets.proteinG * KCAL_PER_GRAM.protein
  );
}

describe("macro targets", () => {
  it("takes protein from body weight, fat as its share, and the rest as carbohydrate", () => {
    const targets = macroTargets(TARGETS, 75, "build_muscle");
    expect(targets.proteinG).toBeCloseTo(135); // 1.8 g × 75 kg
    expect(targets.fatG).toBeCloseTo(600 / 9); // 25% of 2,400 kcal
    expect(targets.carbsG).toBeCloseTo((2400 - 600 - 540) / 4);
    expect(energyOf(targets)).toBeCloseTo(2400);
    expect(targets).toMatchObject({ bodyWeightKg: 75, overBudget: false });
  });

  it("moves protein with the body weight, and carbohydrate with it", () => {
    const lighter = macroTargets(TARGETS, 70, null);
    const heavier = macroTargets(TARGETS, 80, null);
    expect(heavier.proteinG - lighter.proteinG).toBeCloseTo(18);
    expect(lighter.carbsG - heavier.carbsG).toBeCloseTo(18);
    expect(heavier.fatG).toBeCloseTo(lighter.fatG);
  });

  it("follows the protein and fat the account chose", () => {
    const targets = macroTargets({ ...TARGETS, proteinPerKg: 2.2, fatPercent: 30 }, 80, null);
    expect(targets.proteinG).toBeCloseTo(176);
    expect(targets.fatG).toBeCloseTo(80); // 30% of 2,400 kcal is 720 kcal
    expect(energyOf(targets)).toBeCloseTo(2400);
  });

  it("takes protein as the goal's share of the target until there is a body weight", () => {
    expect(macroTargets(TARGETS, null, "build_muscle")).toMatchObject({ bodyWeightKg: null });
    expect(macroTargets(TARGETS, null, "build_muscle").proteinG).toBeCloseTo(120); // 20%
    expect(macroTargets(TARGETS, null, "lose_fat").proteinG).toBeCloseTo(180); // 30%
    expect(macroTargets(TARGETS, null, null).proteinG).toBeCloseTo(120);
    expect(energyOf(macroTargets(TARGETS, null, "lose_fat"))).toBeCloseTo(2400);
  });

  it("never asks for negative carbohydrate, and says the target is too small instead", () => {
    // 2.2 g × 120 kg = 264 g of protein, 1,056 kcal, before fat takes its 25% of 1,200.
    const targets = macroTargets({ dailyKcal: 1200, proteinPerKg: 2.2, fatPercent: 25 }, 120, null);
    expect(targets.carbsG).toBe(0);
    expect(targets.proteinG).toBeCloseTo(264);
    expect(targets.overBudget).toBe(true);
  });
});

describe("the goal's split", () => {
  it("starts every goal from a split that adds up to the whole target", () => {
    for (const split of Object.values(GOAL_SPLITS)) {
      expect(split.carbs + split.fat + split.protein).toBeCloseTo(1);
    }
    expect(splitFor("build_muscle")).toEqual({ carbs: 0.55, fat: 0.25, protein: 0.2 });
    expect(splitFor("get_stronger")).toEqual(splitFor("build_muscle"));
    expect(splitFor("general_fitness")).toEqual(splitFor("build_muscle"));
    expect(splitFor("lose_fat")).toEqual({ carbs: 0.45, fat: 0.25, protein: 0.3 });
    expect(splitFor("endurance")).toEqual({ carbs: 0.6, fat: 0.2, protein: 0.2 });
    expect(splitFor(null)).toEqual(DEFAULT_SPLIT);
  });

  it("puts the split's protein into grams per kilogram, to the tenth", () => {
    // 20% of 2,700 kcal is 135 g; at 63.5 kg that is 2.13 g/kg, kept as 2.1.
    expect(splitTargets(splitFor("build_muscle"), 2700, 63.5)).toEqual({
      proteinPerKg: 2.1,
      fatPercent: 25,
    });
    // 30% of 2,200 kcal is 165 g, 2.6 g/kg at 63.5 kg.
    expect(splitTargets(splitFor("lose_fat"), 2200, 63.5)).toEqual({
      proteinPerKg: 2.6,
      fatPercent: 25,
    });
    expect(splitTargets(splitFor("endurance"), 2700, 63.5).fatPercent).toBe(20);
  });

  it("lands carbohydrate close to the split's own share", () => {
    const start = splitTargets(splitFor("build_muscle"), 2700, 63.5);
    const targets = macroTargets(
      { dailyKcal: 2700, proteinPerKg: start.proteinPerKg!, fatPercent: start.fatPercent },
      63.5,
      "build_muscle",
    );
    expect((targets.carbsG * KCAL_PER_GRAM.carbs) / 2700).toBeCloseTo(0.55, 2);
  });

  it("keeps the protein it offers inside the bounds, and offers none without a weight", () => {
    expect(splitTargets(splitFor("lose_fat"), 10_000, 40).proteinPerKg).toBe(4);
    expect(splitTargets(splitFor("build_muscle"), 500, 150).proteinPerKg).toBe(0.5);
    expect(splitTargets(splitFor("build_muscle"), 2700, null)).toEqual({
      proteinPerKg: null,
      fatPercent: 25,
    });
  });

  it("knows when the targets already hold the split", () => {
    const split = splitFor("build_muscle");
    const held = { dailyKcal: 2700, proteinPerKg: 2.1, fatPercent: 25 };
    expect(matchesSplit(held, split, 63.5)).toBe(true);
    expect(matchesSplit({ ...held, proteinPerKg: 1.8 }, split, 63.5)).toBe(false);
    expect(matchesSplit({ ...held, fatPercent: 30 }, split, 63.5)).toBe(false);
    // With no weight, only fat can differ from the split.
    expect(matchesSplit({ ...held, proteinPerKg: 1.8 }, split, null)).toBe(true);
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

describe("a macronutrient's bar", () => {
  it("reads protein as a minimum, reached once the day holds it", () => {
    expect(macroState("proteinG", 113, 114.3)).toBe("under");
    expect(macroState("proteinG", 114, 114.3)).toBe("reached");
    expect(macroState("proteinG", 140, 114.3)).toBe("reached");
  });

  it("reads carbohydrate and fat as limits, over only once the day passes them", () => {
    expect(macroState("fatG", 75, 75)).toBe("under");
    // 75.4 g shows as 75 g, so it is not over a 75 g target.
    expect(macroState("fatG", 75.4, 75)).toBe("under");
    expect(macroState("fatG", 75.6, 75)).toBe("over");
    expect(macroState("carbsG", 400, 392)).toBe("over");
    expect(macroState("carbsG", 5, 0)).toBe("over");
  });
});

describe("what each food gave", () => {
  const entry = (meal: Meal, food: Food, amount: number) => ({
    ...food,
    foodId: null,
    amount,
    meal,
  });
  const WHEY: Food = {
    name: "Whey",
    portionAmount: 1,
    unit: "scoop",
    kcal: 139,
    carbsG: 5.6,
    fatG: 1.8,
    proteinG: 25,
  };
  const MILK: Food = {
    name: "Milk",
    portionAmount: 100,
    unit: "ml",
    kcal: 52,
    carbsG: 5,
    fatG: 2.5,
    proteinG: 3.3,
  };
  const HOME: Food = {
    name: "Home food",
    portionAmount: 1,
    unit: "serving",
    kcal: 200,
    carbsG: null,
    fatG: null,
    proteinG: null,
  };
  const OIL: Food = {
    name: "Oil",
    portionAmount: 1,
    unit: "tbsp",
    kcal: 120,
    carbsG: 0,
    fatG: 13.6,
    proteinG: 0,
  };

  it("ranks the day's foods by what they gave, with their share of the day", () => {
    const rows = contributions(
      [entry("breakfast", MILK, 250), entry("breakfast", WHEY, 1), entry("lunch", OATS, 80)],
      "proteinG",
    );
    expect(rows.map((row) => [row.name, row.grams])).toEqual([
      ["Whey", 25],
      ["Oats", 13.5],
      ["Milk", 8.3],
    ]);
    // The shares are of the day's 46.8 g, and add up to all of it.
    expect(rows.reduce((sum, row) => sum + (row.share ?? 0), 0)).toBeCloseTo(1);
    expect(rows[0]!.share).toBeCloseTo(25 / 46.8);
    expect(rows[0]).toMatchObject({ unit: "scoop", amount: 1, meals: ["breakfast"] });
  });

  it("adds up a food eaten in more than one meal, whatever its capitals", () => {
    const rows = contributions(
      [
        entry("dinner", MILK, 200),
        entry("breakfast", { ...MILK, name: "milk" }, 250),
        entry("lunch", WHEY, 1),
      ],
      "proteinG",
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ name: "Milk", amount: 450, meals: ["breakfast", "dinner"] });
    // 6.6 g and 8.3 g, each as the day's total counts it.
    expect(rows[1]!.grams).toBeCloseTo(14.9);
  });

  it("puts foods logged without the figure last, and leaves out foods that gave none", () => {
    const rows = contributions(
      [entry("lunch", HOME, 2), entry("lunch", OIL, 1), entry("breakfast", WHEY, 1)],
      "proteinG",
    );
    expect(rows.map((row) => [row.name, row.grams, row.share])).toEqual([
      ["Whey", 25, 1],
      ["Home food", null, null],
    ]);
    expect(contributions([entry("lunch", OIL, 1)], "fatG")[0]).toMatchObject({ grams: 13.6 });
  });

  it("comes to nothing for nothing", () => {
    expect(contributions([], "carbsG")).toEqual([]);
  });
});
