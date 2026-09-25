/**
 * Food: what a day's eating is measured against, and how its meals add up (ADR 0032).
 *
 * Pure rules, shared by the server and the browser, so the add-meal sheet's running totals and
 * the targets form's preview are worked out by the same functions as the screens they update.
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
  /** One food: a whole takeaway fits. */
  itemKcal: 10_000,
  itemGrams: 1_000,
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

/** One food as logged. Only the energy is required, so a guessed meal is one number. */
export type FoodAmounts = {
  kcal: number;
  carbsG: number | null;
  fatG: number | null;
  proteinG: number | null;
};

/** One food in a meal: what it was called, if it was called anything, and what it held. */
export type FoodItem = FoodAmounts & { name: string | null };

export type FoodTotals = { kcal: number; carbsG: number; fatG: number; proteinG: number };

export const NO_FOOD: FoodTotals = { kcal: 0, carbsG: 0, fatG: 0, proteinG: 0 };

/**
 * Everything in a list added up. A macronutrient nobody entered counts as none, so a guessed
 * takeaway adds to the day's energy and nothing to its grams.
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

/** Morning, afternoon, evening or night, by the hour on the account's own clock. */
export function partOfDay(hour: number): "Morning" | "Afternoon" | "Evening" | "Night" {
  if (hour >= 4 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 17) return "Afternoon";
  if (hour >= 17 && hour < 22) return "Evening";
  return "Night";
}

/**
 * A name for a new meal, so logging one never starts with having to think of one: "Afternoon
 * meal 1", or the next number up when the day already has one. The highest number plus one,
 * not a count, so deleting the first of two never hands out a name that is still in use.
 */
export function suggestMealName(existing: readonly string[], hour: number): string {
  const prefix = `${partOfDay(hour)} meal `;
  const numbers = existing
    .filter((name) => name.toLowerCase().startsWith(prefix.toLowerCase()))
    .map((name) => Number(name.slice(prefix.length)))
    .filter((number) => Number.isInteger(number) && number > 0);
  return `${prefix}${numbers.length > 0 ? Math.max(...numbers) + 1 : 1}`;
}
