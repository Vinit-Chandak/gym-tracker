/**
 * Food: what a day's eating is measured against, and how its meals add up (ADRs 0032, 0033).
 *
 * Pure rules, shared by the server and the browser, so a sheet's preview of what a portion holds
 * and the targets form's preview are worked out by the same functions as the screens they update.
 * Energy is in kilocalories and the three macronutrients in grams, everywhere.
 */

/** Energy per gram: the Atwater factors every food label is calculated with. */
export const KCAL_PER_GRAM = { carbs: 4, fat: 9, protein: 4 } as const;

/**
 * How the day's target is shared out between the three macronutrients.
 *
 * `body_weight`: protein comes from body weight, fat is a quarter of the target, and carbohydrate
 * is whatever energy is left, so the three add up to the target. `fixed_55_25_20`: 55% of the
 * target's energy as carbohydrate, 25% as fat and 20% as protein, whatever anyone weighs.
 */
export const MACRO_SPLITS = ["body_weight", "fixed_55_25_20"] as const;
export type MacroSplit = (typeof MACRO_SPLITS)[number];

export const FAT_SHARE = 0.25;
export const FIXED_SPLIT = { carbs: 0.55, fat: 0.25, protein: 0.2 } as const;
export const DEFAULT_PROTEIN_PER_KG = 1.8;

/** The goal is met anywhere from 90% to 110% of the day's target, both ends included. */
export const GOAL_BAND = { low: 0.9, high: 1.1 } as const;

/**
 * Bounds that catch a slipped finger, not advice: what anyone should eat is theirs to decide.
 * The same numbers are written into the tables' check constraints.
 */
export const NUTRITION_LIMITS = {
  dailyKcal: { min: 500, max: 10_000 },
  proteinPerKg: { min: 0.5, max: 4 },
  /** One food, as a portion or as eaten: a whole takeaway fits. */
  itemKcal: 10_000,
  itemGrams: 1_000,
  /** A portion, or an amount eaten, in the food's own unit: ten kilograms of anything. */
  amount: 10_000,
  /** The foods one saved meal holds. */
  itemsPerMeal: 30,
  name: 80,
} as const;

export type NutritionTargets = {
  /** The day's energy target: `t` in the goal band. */
  dailyKcal: number;
  /** Grams of protein per kilogram of body weight, for the `body_weight` split. */
  proteinPerKg: number;
  split: MacroSplit;
};

export type MacroGrams = { carbsG: number; fatG: number; proteinG: number };

export type MacroTargets = MacroGrams & {
  kcal: number;
  /**
   * The split actually applied. Protein cannot come from a body weight nobody has recorded, so
   * an account without one is given the fixed split until it has one.
   */
  split: MacroSplit;
  /** The body weight protein was worked out from, when it was. */
  bodyWeightKg: number | null;
  /**
   * Protein and fat alone need more energy than the target holds. Carbohydrate is then nil
   * rather than negative, and the three come to more than the target.
   */
  overBudget: boolean;
};

/**
 * Grams of each macronutrient for a day, from the targets and the newest body weight.
 *
 * Nothing here is stored: protein is read from whatever the account weighs today, so it
 * follows every new reading without anything having to be recalculated.
 */
export function macroTargets(targets: NutritionTargets, bodyWeightKg: number | null): MacroTargets {
  const kcal = targets.dailyKcal;
  if (targets.split === "body_weight" && bodyWeightKg !== null && bodyWeightKg > 0) {
    const proteinG = targets.proteinPerKg * bodyWeightKg;
    const fatKcal = kcal * FAT_SHARE;
    const carbsKcal = kcal - fatKcal - proteinG * KCAL_PER_GRAM.protein;
    return {
      kcal,
      carbsG: Math.max(0, carbsKcal) / KCAL_PER_GRAM.carbs,
      fatG: fatKcal / KCAL_PER_GRAM.fat,
      proteinG,
      split: "body_weight",
      bodyWeightKg,
      overBudget: carbsKcal < 0,
    };
  }
  return {
    kcal,
    carbsG: (kcal * FIXED_SPLIT.carbs) / KCAL_PER_GRAM.carbs,
    fatG: (kcal * FIXED_SPLIT.fat) / KCAL_PER_GRAM.fat,
    proteinG: (kcal * FIXED_SPLIT.protein) / KCAL_PER_GRAM.protein,
    split: "fixed_55_25_20",
    bodyWeightKg: null,
    overBudget: false,
  };
}

/**
 * The goal band's exact ends, in tenths, matching both storage and the displayed kcal.
 */
export function goalBand(dailyKcal: number): { low: number; high: number } {
  return {
    low: (dailyKcal * 9) / 10,
    high: (dailyKcal * 11) / 10,
  };
}

/** Below the band (a day still being eaten, usually), inside it, or past it. */
export type GoalStatus = "under" | "met" | "over";

/**
 * Where a day's total stands against its goal, `[0.9t, 1.1t]`.
 *
 * Compared in tenths of a kilocalorie, which is as fine as anything is stored. 0.9 has no exact
 * binary form: 0.9 × 501 comes out as 450.90000000000003, and a day of exactly 450.9 kcal must
 * meet the goal, not fall a rounding error short of it.
 */
export function goalStatus(eatenKcal: number, dailyKcal: number): GoalStatus {
  const eatenTenths = Math.round(eatenKcal * 10);
  if (eatenTenths < dailyKcal * 9) return "under";
  if (eatenTenths > dailyKcal * 11) return "over";
  return "met";
}

/** What a food holds, or what an amount of it came to. Only the energy is always known. */
export type FoodAmounts = {
  kcal: number;
  carbsG: number | null;
  fatG: number | null;
  proteinG: number | null;
};

export type FoodTotals = { kcal: number; carbsG: number; fatG: number; proteinG: number };

/**
 * Everything in a list added up. A macronutrient nobody entered counts as none, so a food saved
 * with its energy alone adds to the day's energy and nothing to its grams.
 *
 * Summed in tenths, which is how the numbers are stored, so a column of 0.1 g entries adds up
 * to what it says rather than to 0.30000000000000004.
 */
export function addUp(items: readonly FoodAmounts[]): FoodTotals {
  const tenths = (value: number | null) => Math.round((value ?? 0) * 10);
  let kcal = 0;
  let carbs = 0;
  let fat = 0;
  let protein = 0;
  for (const item of items) {
    kcal += tenths(item.kcal);
    carbs += tenths(item.carbsG);
    fat += tenths(item.fatG);
    protein += tenths(item.proteinG);
  }
  return { kcal: kcal / 10, carbsG: carbs / 10, fatG: fat / 10, proteinG: protein / 10 };
}

/** The day's meals, in the order they are eaten, so the list reads like the day. */
export const MEALS = [
  "breakfast",
  "morning_snack",
  "lunch",
  "afternoon_snack",
  "dinner",
  "evening_snack",
] as const;
export type Meal = (typeof MEALS)[number];

/** A meal as it appears in a URL: `morning-snack`. */
export function mealSlug(meal: Meal): string {
  return meal.replace("_", "-");
}

/** The meal a URL names, or null when it names none. */
export function mealFromSlug(slug: string): Meal | null {
  return MEALS.find((meal) => mealSlug(meal) === slug) ?? null;
}

/**
 * What a food's portion is measured in. A food is always logged in its own unit, so nothing is
 * ever converted: oats saved per 100 g are eaten in grams, a shake saved per scoop in scoops.
 */
export const FOOD_UNITS = [
  "g",
  "kg",
  "ml",
  "l",
  "oz",
  "cup",
  "tbsp",
  "tsp",
  "piece",
  "slice",
  "scoop",
  "serving",
] as const;
export type FoodUnit = (typeof FOOD_UNITS)[number];

/**
 * A food as it is kept in My foods: a name, and what one portion of it holds, e.g. 100 g of oats
 * at 389 kcal. Only the portion and its energy are required; a macronutrient left out is unknown.
 */
export type Food = FoodAmounts & {
  name: string;
  portionAmount: number;
  unit: FoodUnit;
};

/**
 * A food as eaten: a copy of the food as it was when it was logged, the food it came from while
 * that still exists, and how much of it, in the food's own unit. A copy, so that correcting a
 * food in My foods never rewrites a day that has already been eaten.
 */
export type LoggedFood = Food & { foodId: string | null; amount: number };

/**
 * What an amount of a food holds: its portion's figures scaled by amount ÷ portion, each to the
 * tenth.
 *
 * Worked in whole numbers, tenths of the figures and hundredths of the amounts, which is as
 * finely as they are stored. The product is exact, and the one division is correctly rounded,
 * so an exact half always rounds up and every screen that asks gets the same tenth.
 */
export function scaleFood(
  food: Pick<Food, "portionAmount" | "kcal" | "carbsG" | "fatG" | "proteinG">,
  amount: number,
): FoodAmounts {
  const portion = Math.round(food.portionAmount * 100);
  const eaten = Math.round(amount * 100);
  // A portion of nothing cannot be scaled; validation never stores one.
  const scale = (value: number) =>
    portion > 0 ? Math.round((Math.round(value * 10) * eaten) / portion) / 10 : value;
  return {
    kcal: scale(food.kcal),
    carbsG: food.carbsG === null ? null : scale(food.carbsG),
    fatG: food.fatG === null ? null : scale(food.fatG),
    proteinG: food.proteinG === null ? null : scale(food.proteinG),
  };
}

/** What a logged food came to. */
export function eaten(food: LoggedFood): FoodAmounts {
  return scaleFood(food, food.amount);
}

/**
 * Which figure an amount of a food would take past the bounds for one food eaten, if any: a
 * slipped finger typing 10000 g of something saved per gram, say.
 */
export function overLimit(
  food: Pick<Food, "portionAmount" | "kcal" | "carbsG" | "fatG" | "proteinG">,
  amount: number,
): keyof FoodAmounts | null {
  const scaled = scaleFood(food, amount);
  if (scaled.kcal > NUTRITION_LIMITS.itemKcal) return "kcal";
  for (const key of ["carbsG", "fatG", "proteinG"] as const) {
    if ((scaled[key] ?? 0) > NUTRITION_LIMITS.itemGrams) return key;
  }
  return null;
}

/**
 * Rounds a number as the decimal it was written as, the way Postgres stores it: 1.255 to the
 * hundredth is 1.26, where multiplying by 100 first finds the binary number just under 125.5.
 */
export function roundTo(value: number, places: number): number {
  const shifted = Math.round(Number(`${value}e${places}`));
  const rounded = Number.isFinite(shifted)
    ? shifted / 10 ** places
    : Math.round(value * 10 ** places) / 10 ** places;
  // `+ 0` turns the -0 a small negative rounds to into 0.
  return rounded + 0;
}

/** An amount as stored: to the hundredth. */
export const toHundredth = (value: number): number => roundTo(value, 2);

/**
 * The amounts one tap away when logging a food: half its portion, the portion, one and a half
 * and two, which covers "a bit less", "the usual" and "double" without typing.
 */
export function quickAmounts(portionAmount: number): number[] {
  return [0.5, 1, 1.5, 2].map((share) => toHundredth(portionAmount * share));
}

/**
 * Whether two lists hold the same foods in the same amounts, in any order. A day's meal that does
 * is that saved meal, which is what its star shows; change a portion and it is a meal of its own.
 */
export function sameFoods(a: readonly LoggedFood[], b: readonly LoggedFood[]): boolean {
  if (a.length !== b.length) return false;
  const key = (food: LoggedFood) =>
    JSON.stringify([
      food.name.trim().toLowerCase(),
      food.unit,
      food.portionAmount,
      food.amount,
      food.kcal,
      food.carbsG,
      food.fatG,
      food.proteinG,
    ]);
  const left = a.map(key).sort();
  const right = b.map(key).sort();
  return left.every((value, index) => value === right[index]);
}
