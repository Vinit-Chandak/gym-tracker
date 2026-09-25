import { z } from "zod";

import {
  MACRO_SPLITS,
  NUTRITION_LIMITS,
  type FoodItem,
  type NutritionTargets,
} from "@/domain/nutrition";

const asString = (value: unknown): string => (typeof value === "string" ? value : "");

const grouped = (value: number): string => value.toLocaleString("en-GB");

/** A number as typed: blank is null, and a decimal comma is read as a point. */
function readNumber(raw: string): number | null | "invalid" {
  const value = raw.trim();
  if (value === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : "invalid";
}

/** To the tenth, which is as fine as anything is stored. */
const toTenth = (value: number): number => Math.round(value * 10) / 10;

/**
 * The targets on the Food screen. Protein per kilogram is submitted with either split, from a
 * hidden field when the fixed split hides it, so switching back to body weight finds it as it
 * was left.
 */
export const targetsInputSchema = z
  .object({
    dailyKcal: z.preprocess(asString, z.string()),
    split: z.enum(MACRO_SPLITS, { error: "Choose how to split it." }),
    proteinPerKg: z.preprocess(asString, z.string()),
  })
  .transform((values, ctx): NutritionTargets => {
    const { dailyKcal: kcalLimits, proteinPerKg: proteinLimits } = NUTRITION_LIMITS;
    const kcal = readNumber(values.dailyKcal);
    if (kcal === null || kcal === "invalid") {
      ctx.addIssue({ code: "custom", path: ["dailyKcal"], message: "Enter your daily target." });
    } else if (Math.round(kcal) < kcalLimits.min || Math.round(kcal) > kcalLimits.max) {
      ctx.addIssue({
        code: "custom",
        path: ["dailyKcal"],
        message: `Enter a target between ${grouped(kcalLimits.min)} and ${grouped(kcalLimits.max)} kcal.`,
      });
    }
    const protein = readNumber(values.proteinPerKg);
    if (protein === null || protein === "invalid") {
      ctx.addIssue({ code: "custom", path: ["proteinPerKg"], message: "Enter grams per kg." });
    } else if (toTenth(protein) < proteinLimits.min || toTenth(protein) > proteinLimits.max) {
      ctx.addIssue({
        code: "custom",
        path: ["proteinPerKg"],
        message: `Enter between ${proteinLimits.min} and ${proteinLimits.max} g per kg.`,
      });
    }
    if (typeof kcal !== "number" || typeof protein !== "number") return z.NEVER;
    return { dailyKcal: Math.round(kcal), proteinPerKg: toTenth(protein), split: values.split };
  });

/** One food's row in the sheet, as typed. */
export type FoodDraft = {
  name: string;
  kcal: string;
  carbsG: string;
  fatG: string;
  proteinG: string;
};

/** What the sheet sends: every row as typed, so errors come back against the row they are on. */
export type MealDraft = {
  /** Present when an existing meal is being edited. */
  mealId?: string;
  name: string;
  items: FoodDraft[];
  starred: boolean;
};

const AMOUNTS = ["kcal", "carbsG", "fatG", "proteinG"] as const;

/** A row nobody typed anything into: an extra "Add food" tap, not a food without energy. */
export function isBlankFood(food: FoodDraft): boolean {
  return [food.name, ...AMOUNTS.map((key) => food[key])].every((value) => value.trim() === "");
}

/**
 * A meal from the sheet. Rows left entirely blank are passed over; every other row needs its
 * energy, and may give any of its macronutrients. Errors are keyed `items.<row>.<field>` by the
 * row's place in what was sent, so the sheet can point at the field itself.
 */
export const mealInputSchema = z
  .object({
    mealId: z.uuid().optional(),
    name: z.string(),
    items: z
      .array(
        z.object({
          name: z.string(),
          kcal: z.string(),
          carbsG: z.string(),
          fatG: z.string(),
          proteinG: z.string(),
        }),
      )
      .max(NUTRITION_LIMITS.itemsPerMeal, {
        error: `A meal holds at most ${NUTRITION_LIMITS.itemsPerMeal} foods.`,
      }),
    starred: z.boolean(),
  })
  .transform((meal, ctx) => {
    const name = meal.name.trim();
    if (name === "") ctx.addIssue({ code: "custom", path: ["name"], message: "Name this meal." });
    else if (name.length > NUTRITION_LIMITS.name) {
      ctx.addIssue({ code: "custom", path: ["name"], message: "Keep this under 80 characters." });
    }

    const items: FoodItem[] = [];
    let valid = true;
    meal.items.forEach((row, index) => {
      if (isBlankFood(row)) return;
      const fail = (field: string, message: string) => {
        valid = false;
        ctx.addIssue({ code: "custom", path: ["items", index, field], message });
      };
      const foodName = row.name.trim();
      if (foodName.length > NUTRITION_LIMITS.name) fail("name", "Keep this under 80 characters.");

      const amounts = {} as Record<(typeof AMOUNTS)[number], number | null>;
      for (const key of AMOUNTS) {
        const max = key === "kcal" ? NUTRITION_LIMITS.itemKcal : NUTRITION_LIMITS.itemGrams;
        const value = readNumber(row[key]);
        if (value === "invalid") fail(key, "Enter a number.");
        else if (value !== null && toTenth(value) > max) {
          fail(key, `At most ${grouped(max)}${key === "kcal" ? " kcal" : " g"}.`);
        }
        amounts[key] = typeof value === "number" ? toTenth(value) : null;
      }
      if (row.kcal.trim() === "") fail("kcal", "Enter the kcal.");

      const { kcal, ...macros } = amounts;
      if (kcal !== null) items.push({ name: foodName || null, kcal, ...macros });
    });
    // Nothing but blank rows: the first one is where the energy is missing.
    if (meal.items.every(isBlankFood)) {
      valid = false;
      ctx.addIssue({ code: "custom", path: ["items", 0, "kcal"], message: "Enter the kcal." });
    }

    if (!valid || name === "" || name.length > NUTRITION_LIMITS.name) return z.NEVER;
    return { mealId: meal.mealId, name, items, starred: meal.starred };
  });

export type MealInputParsed = z.output<typeof mealInputSchema>;

/** Zod's issues as the sheet reads them: the first message for each dotted path. */
export function issuesByPath(issues: z.ZodError["issues"]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}
