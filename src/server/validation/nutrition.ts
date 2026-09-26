import { z } from "zod";

import {
  FOOD_UNITS,
  MEALS,
  NUTRITION_LIMITS,
  roundTo,
  toHundredth,
  type Food,
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

/** To the tenth, which is as fine as a figure is stored. */
const toTenth = (value: number): number => roundTo(value, 1);

/**
 * The Targets screen (ADR 0035): the day's target, protein per kilogram of body weight, and fat
 * as a share of the target. Carbohydrate is whatever energy is left, so nothing is asked of it.
 */
export const targetsInputSchema = z
  .object({
    dailyKcal: z.preprocess(asString, z.string()),
    proteinPerKg: z.preprocess(asString, z.string()),
    fatPercent: z.preprocess(asString, z.string()),
  })
  .transform((values, ctx): NutritionTargets => {
    const {
      dailyKcal: kcalLimits,
      proteinPerKg: proteinLimits,
      fatPercent: fatLimits,
    } = NUTRITION_LIMITS;
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
    const fat = readNumber(values.fatPercent);
    if (fat === null || fat === "invalid") {
      ctx.addIssue({ code: "custom", path: ["fatPercent"], message: "Enter fat's share." });
    } else if (Math.round(fat) < fatLimits.min || Math.round(fat) > fatLimits.max) {
      ctx.addIssue({
        code: "custom",
        path: ["fatPercent"],
        message: `Enter between ${fatLimits.min} and ${fatLimits.max}%.`,
      });
    }
    if (typeof kcal !== "number" || typeof protein !== "number" || typeof fat !== "number") {
      return z.NEVER;
    }
    return {
      dailyKcal: Math.round(kcal),
      proteinPerKg: toTenth(protein),
      fatPercent: Math.round(fat),
    };
  });

/** A food's fields as typed in its sheet: what one portion of it holds. */
export type FoodDraft = {
  name: string;
  portionAmount: string;
  unit: string;
  kcal: string;
  carbsG: string;
  fatG: string;
  proteinG: string;
};

const FOOD_DRAFT = {
  name: z.string(),
  portionAmount: z.string(),
  unit: z.string(),
  kcal: z.string(),
  carbsG: z.string(),
  fatG: z.string(),
  proteinG: z.string(),
};

type Issues = z.core.$RefinementCtx;

/** Says what is wrong with a field, against the field itself. */
const fail = (ctx: Issues, path: string, message: string) =>
  ctx.addIssue({ code: "custom", path: [path], message });

/**
 * A portion or an amount eaten: required, above nothing once kept to the hundredth, and no more
 * than ten thousand of its unit. Null, with the reason said, when it is not one.
 */
function readAmount(ctx: Issues, path: string, raw: string, missing: string): number | null {
  const value = readNumber(raw);
  if (value === null) fail(ctx, path, missing);
  else if (value === "invalid") fail(ctx, path, "Enter a number.");
  else if (toHundredth(value) <= 0) fail(ctx, path, "Enter more than 0.");
  else if (toHundredth(value) > NUTRITION_LIMITS.amount) {
    fail(ctx, path, `At most ${grouped(NUTRITION_LIMITS.amount)}.`);
  } else return toHundredth(value);
  return null;
}

/** A name for a food or a saved meal: required, and short enough to fit a row. */
function readName(ctx: Issues, path: string, raw: string, missing: string): string | null {
  const name = raw.trim();
  if (name === "") fail(ctx, path, missing);
  else if (name.length > NUTRITION_LIMITS.name) fail(ctx, path, "Keep this under 80 characters.");
  else return name;
  return null;
}

/**
 * A food from its sheet. Only the name, the portion and its energy are required; a
 * macronutrient left blank is unknown. Figures are kept to the tenth, as they are stored.
 */
function readFood(ctx: Issues, draft: FoodDraft): Food | null {
  const name = readName(ctx, "name", draft.name, "Name this food.");
  const portionAmount = readAmount(ctx, "portionAmount", draft.portionAmount, "Enter the portion.");
  const unit = (FOOD_UNITS as readonly string[]).includes(draft.unit)
    ? (draft.unit as Food["unit"])
    : null;
  if (!unit) fail(ctx, "unit", "Choose a unit.");

  const figures = {} as Record<"kcal" | "carbsG" | "fatG" | "proteinG", number | null>;
  let valid = true;
  for (const key of ["kcal", "carbsG", "fatG", "proteinG"] as const) {
    const max = key === "kcal" ? NUTRITION_LIMITS.itemKcal : NUTRITION_LIMITS.itemGrams;
    const value = readNumber(draft[key]);
    figures[key] = typeof value === "number" ? toTenth(value) : null;
    if (value === null && key === "kcal") fail(ctx, key, "Enter the kcal.");
    else if (value === "invalid") fail(ctx, key, "Enter a number.");
    else if (value !== null && toTenth(value) > max) {
      fail(ctx, key, `At most ${grouped(max)}${key === "kcal" ? " kcal" : " g"}.`);
    } else continue;
    valid = false;
  }
  if (!valid || name === null || portionAmount === null || !unit || figures.kcal === null) {
    return null;
  }
  return {
    name,
    portionAmount,
    unit,
    kcal: figures.kcal,
    carbsG: figures.carbsG,
    fatG: figures.fatG,
    proteinG: figures.proteinG,
  };
}

/** Where a sheet logs to: a meal of the day the page was showing, kept across a retry. */
const PLACE = {
  /** Stable across retries, including after a lost server reply. */
  submissionKey: z.uuid().optional(),
  /** The day the page was opened on, which stays its day past midnight. */
  eatenOn: z.iso.date(),
  meal: z.enum(MEALS),
};

/** A food from My foods, and how much of it was eaten. */
export const logFoodSchema = z
  .object({ ...PLACE, foodId: z.uuid(), amount: z.string() })
  .transform((input, ctx) => {
    const amount = readAmount(ctx, "amount", input.amount, "Enter how much.");
    if (amount === null) return z.NEVER;
    return { ...input, amount };
  });
export type LogFoodDraft = z.input<typeof logFoodSchema>;

/** A new food, and how much of it was eaten: logging it is what keeps it in My foods. */
export const createFoodSchema = z
  .object({ ...PLACE, ...FOOD_DRAFT, amount: z.string() })
  .transform((input, ctx) => {
    const food = readFood(ctx, input);
    const amount = readAmount(ctx, "amount", input.amount, "Enter how much.");
    if (!food || amount === null) return z.NEVER;
    const { submissionKey, eatenOn, meal } = input;
    return { submissionKey, eatenOn, meal, food, amount };
  });
export type CreateFoodDraft = z.input<typeof createFoodSchema>;

/** A new food kept in My foods without being logged (ADR 0035). */
export const createLibraryFoodSchema = z
  .object({ submissionKey: z.uuid().optional(), ...FOOD_DRAFT })
  .transform((input, ctx) => {
    const food = readFood(ctx, input);
    if (!food) return z.NEVER;
    return { submissionKey: input.submissionKey, food };
  });
export type CreateLibraryFoodDraft = z.input<typeof createLibraryFoodSchema>;

/**
 * A meal built in My foods (ADR 0035): its name and its foods, each a food from My foods or one
 * the meal already held, at an amount. Errors come back against `name`, `items`, or an item's
 * amount as `items.<n>.amount`.
 */
export const saveLibraryMealSchema = z
  .object({
    submissionKey: z.uuid().optional(),
    savedMealId: z.uuid().optional(),
    name: z.string(),
    items: z.array(
      z.union([
        z.object({ foodId: z.uuid(), amount: z.string() }),
        z.object({ keep: z.number().int().min(0), amount: z.string() }),
      ]),
    ),
  })
  .transform((input, ctx) => {
    const name = readName(ctx, "name", input.name, "Name this meal.");
    if (input.items.length === 0) fail(ctx, "items", "Add a food to this meal.");
    else if (input.items.length > NUTRITION_LIMITS.itemsPerMeal) {
      fail(ctx, "items", `A meal holds at most ${NUTRITION_LIMITS.itemsPerMeal} foods.`);
    }
    const items = input.items.map((item, index) => {
      const amount = readAmount(ctx, `items.${index}.amount`, item.amount, "Enter how much.");
      if (amount === null) return null;
      return "foodId" in item ? { foodId: item.foodId, amount } : { keep: item.keep, amount };
    });
    if (name === null || items.some((item) => item === null) || input.items.length === 0) {
      return z.NEVER;
    }
    if (input.items.length > NUTRITION_LIMITS.itemsPerMeal) return z.NEVER;
    return {
      submissionKey: input.submissionKey,
      savedMealId: input.savedMealId,
      name,
      items: items.filter((item) => item !== null),
    };
  });
export type SaveLibraryMealDraft = z.input<typeof saveLibraryMealSchema>;

/** A correction to a food in My foods. */
export const updateFoodSchema = z
  .object({ foodId: z.uuid(), ...FOOD_DRAFT })
  .transform((input, ctx) => {
    const food = readFood(ctx, input);
    if (!food) return z.NEVER;
    return { foodId: input.foodId, food };
  });
export type UpdateFoodDraft = z.input<typeof updateFoodSchema>;

/** A different amount of a food already eaten. */
export const updateEntrySchema = z
  .object({ entryId: z.uuid(), amount: z.string() })
  .transform((input, ctx) => {
    const amount = readAmount(ctx, "amount", input.amount, "Enter how much.");
    if (amount === null) return z.NEVER;
    return { entryId: input.entryId, amount };
  });
export type UpdateEntryDraft = z.input<typeof updateEntrySchema>;

/** A meal starred: saved as it stands, under a name. */
export const saveMealSchema = z.object({ ...PLACE, name: z.string() }).transform((input, ctx) => {
  const name = readName(ctx, "name", input.name, "Name this meal.");
  if (name === null) return z.NEVER;
  return { ...input, name };
});
export type SaveMealDraft = z.input<typeof saveMealSchema>;

/** A saved meal added to a meal of the day. */
export const logSavedMealSchema = z.object({ ...PLACE, savedMealId: z.uuid() });
export type LogSavedMealDraft = z.input<typeof logSavedMealSchema>;

/** Zod's issues as the sheet reads them: the first message for each dotted path. */
export function issuesByPath(issues: z.ZodError["issues"]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}
