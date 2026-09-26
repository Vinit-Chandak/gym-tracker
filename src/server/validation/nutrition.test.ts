import { describe, expect, it } from "vitest";

import type { z } from "zod";

import { parseForm } from "./form";
import {
  createFoodSchema,
  createLibraryFoodSchema,
  issuesByPath,
  logFoodSchema,
  logSavedMealSchema,
  saveLibraryMealSchema,
  saveMealSchema,
  targetsInputSchema,
  updateEntrySchema,
  updateFoodSchema,
  type CreateFoodDraft,
} from "./nutrition";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const DAY = "2026-09-25";
const ID = "00000000-0000-4000-8000-000000000001";

/** A new food as its sheet sends it: everything typed, as typed. */
function newFood(fields: Partial<CreateFoodDraft> = {}): CreateFoodDraft {
  return {
    eatenOn: DAY,
    meal: "breakfast",
    name: "Oats",
    portionAmount: "100",
    unit: "g",
    kcal: "389",
    carbsG: "",
    fatG: "",
    proteinG: "",
    amount: "60",
    ...fields,
  };
}

function errorsOf(schema: z.ZodType, input: unknown): Record<string, string> {
  const result = schema.safeParse(input);
  return result.success ? {} : issuesByPath(result.error.issues);
}

describe("targets", () => {
  it("reads the target, grams of protein per kilogram and fat's share", () => {
    const parsed = parseForm(
      targetsInputSchema,
      form({ dailyKcal: " 2400 ", proteinPerKg: "1,8", fatPercent: "25" }),
    );
    expect(parsed).toEqual({
      success: true,
      data: { dailyKcal: 2400, proteinPerKg: 1.8, fatPercent: 25 },
    });
  });

  it("keeps whole kilocalories, tenths of a gram and whole percent", () => {
    const parsed = parseForm(
      targetsInputSchema,
      form({ dailyKcal: "2399.6", proteinPerKg: "2.04", fatPercent: "27.6" }),
    );
    expect(parsed.success && parsed.data).toEqual({
      dailyKcal: 2400,
      proteinPerKg: 2,
      fatPercent: 28,
    });
  });

  it("says what is missing or out of bounds, against its own field", () => {
    const missing = parseForm(targetsInputSchema, form({}));
    expect(!missing.success && missing.state.fieldErrors).toEqual({
      dailyKcal: "Enter your daily target.",
      proteinPerKg: "Enter grams per kg.",
      fatPercent: "Enter fat's share.",
    });
    const bounds = parseForm(
      targetsInputSchema,
      form({ dailyKcal: "20000", proteinPerKg: "9", fatPercent: "250" }),
    );
    expect(!bounds.success && bounds.state.fieldErrors).toEqual({
      dailyKcal: "Enter a target between 500 and 10,000 kcal.",
      proteinPerKg: "Enter between 0.5 and 4 g per kg.",
      fatPercent: "Enter between 5 and 80%.",
    });
  });
});

describe("a new food", () => {
  it("needs only a name, a portion and its energy", () => {
    expect(createFoodSchema.parse(newFood())).toEqual({
      submissionKey: undefined,
      eatenOn: DAY,
      meal: "breakfast",
      food: {
        name: "Oats",
        portionAmount: 100,
        unit: "g",
        kcal: 389,
        carbsG: null,
        fatG: null,
        proteinG: null,
      },
      amount: 60,
    });
  });

  it("reads every figure, a decimal comma included, figures to the tenth and amounts to the hundredth", () => {
    const parsed = createFoodSchema.parse(
      newFood({
        name: "  Whey  ",
        portionAmount: "1",
        unit: "scoop",
        kcal: "139,04",
        carbsG: "5.64",
        fatG: "1,8",
        proteinG: "25",
        amount: "1,255",
        submissionKey: ID,
      }),
    );
    expect(parsed).toMatchObject({
      submissionKey: ID,
      food: {
        name: "Whey",
        portionAmount: 1,
        unit: "scoop",
        kcal: 139,
        carbsG: 5.6,
        fatG: 1.8,
        proteinG: 25,
      },
      amount: 1.26,
    });
  });

  it("says everything that is wrong at once, each against its own field", () => {
    expect(
      errorsOf(
        createFoodSchema,
        newFood({
          name: " ",
          portionAmount: "",
          unit: "bucket",
          kcal: "",
          carbsG: "abc",
          proteinG: "2000",
          amount: "0",
        }),
      ),
    ).toEqual({
      name: "Name this food.",
      portionAmount: "Enter the portion.",
      unit: "Choose a unit.",
      kcal: "Enter the kcal.",
      carbsG: "Enter a number.",
      proteinG: "At most 1,000 g.",
      amount: "Enter more than 0.",
    });
  });

  it("keeps portions and amounts above nothing and within ten thousand", () => {
    expect(errorsOf(createFoodSchema, newFood({ portionAmount: "0.004" }))).toEqual({
      portionAmount: "Enter more than 0.",
    });
    expect(errorsOf(createFoodSchema, newFood({ amount: "10000.01", kcal: "20000" }))).toEqual({
      amount: "At most 10,000.",
      kcal: "At most 10,000 kcal.",
    });
    expect(errorsOf(createFoodSchema, newFood({ name: "x".repeat(81) }))).toEqual({
      name: "Keep this under 80 characters.",
    });
  });
});

describe("logging and changing an amount", () => {
  it("reads how much of a saved food was eaten", () => {
    expect(
      logFoodSchema.parse({ eatenOn: DAY, meal: "lunch", foodId: ID, amount: " 200 " }),
    ).toEqual({ eatenOn: DAY, meal: "lunch", foodId: ID, amount: 200 });
    expect(
      errorsOf(logFoodSchema, { eatenOn: DAY, meal: "lunch", foodId: ID, amount: "" }),
    ).toEqual({ amount: "Enter how much." });
    expect(errorsOf(updateEntrySchema, { entryId: ID, amount: "a lot" })).toEqual({
      amount: "Enter a number.",
    });
    expect(updateEntrySchema.parse({ entryId: ID, amount: "0.5" })).toEqual({
      entryId: ID,
      amount: 0.5,
    });
  });

  it("refuses a meal, a day or an id that cannot be one", () => {
    const base = { eatenOn: DAY, meal: "lunch", foodId: ID, amount: "1" };
    for (const wrong of [{ meal: "brunch" }, { eatenOn: "2026-02-31" }, { foodId: "not-an-id" }]) {
      expect(logFoodSchema.safeParse({ ...base, ...wrong }).success).toBe(false);
    }
    expect(
      logSavedMealSchema.safeParse({ eatenOn: DAY, meal: "dinner", savedMealId: ID }).success,
    ).toBe(true);
    expect(
      logSavedMealSchema.safeParse({ eatenOn: DAY, meal: "supper", savedMealId: ID }).success,
    ).toBe(false);
  });
});

describe("saving a meal and correcting a food", () => {
  it("needs a name for the meal", () => {
    expect(saveMealSchema.parse({ eatenOn: DAY, meal: "breakfast", name: " Usual " })).toEqual({
      eatenOn: DAY,
      meal: "breakfast",
      name: "Usual",
    });
    expect(errorsOf(saveMealSchema, { eatenOn: DAY, meal: "breakfast", name: "" })).toEqual({
      name: "Name this meal.",
    });
  });

  it("reads a correction the way it reads a new food", () => {
    const { eatenOn: _day, meal: _meal, amount: _amount, ...fields } = newFood({ kcal: "379" });
    expect(updateFoodSchema.parse({ foodId: ID, ...fields })).toEqual({
      foodId: ID,
      food: expect.objectContaining({ name: "Oats", kcal: 379 }),
    });
    expect(errorsOf(updateFoodSchema, { foodId: ID, ...fields, kcal: "" })).toEqual({
      kcal: "Enter the kcal.",
    });
  });
});

describe("My foods", () => {
  it("reads a food kept without logging it: no day, no meal, no amount", () => {
    const { eatenOn: _day, meal: _meal, amount: _amount, ...fields } = newFood();
    expect(createLibraryFoodSchema.parse({ submissionKey: ID, ...fields })).toEqual({
      submissionKey: ID,
      food: {
        name: "Oats",
        portionAmount: 100,
        unit: "g",
        kcal: 389,
        carbsG: null,
        fatG: null,
        proteinG: null,
      },
    });
    expect(errorsOf(createLibraryFoodSchema, { ...fields, name: " " })).toEqual({
      name: "Name this food.",
    });
  });

  it("reads a meal's foods, from My foods or kept from the meal, each at an amount", () => {
    expect(
      saveLibraryMealSchema.parse({
        savedMealId: ID,
        name: " Usual breakfast ",
        items: [
          { foodId: ID, amount: "80" },
          { keep: 2, amount: "1,5" },
        ],
      }),
    ).toEqual({
      submissionKey: undefined,
      savedMealId: ID,
      name: "Usual breakfast",
      items: [
        { foodId: ID, amount: 80 },
        { keep: 2, amount: 1.5 },
      ],
    });
  });

  it("says what is wrong with the name, the list and each amount, against each", () => {
    expect(errorsOf(saveLibraryMealSchema, { name: "", items: [] })).toEqual({
      name: "Name this meal.",
      items: "Add a food to this meal.",
    });
    expect(
      errorsOf(saveLibraryMealSchema, {
        name: "Heap",
        items: [
          { foodId: ID, amount: "80" },
          { foodId: ID, amount: "0" },
        ],
      }),
    ).toEqual({ "items.1.amount": "Enter more than 0." });
    expect(
      errorsOf(saveLibraryMealSchema, {
        name: "Too many",
        items: Array.from({ length: 31 }, () => ({ foodId: ID, amount: "1" })),
      }),
    ).toEqual({ items: "A meal holds at most 30 foods." });
  });
});
