import { describe, expect, it } from "vitest";

import { parseForm } from "./form";
import {
  issuesByPath,
  mealInputSchema,
  targetsInputSchema,
  type FoodDraft,
  type MealDraft,
} from "./nutrition";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const BLANK: FoodDraft = { name: "", kcal: "", carbsG: "", fatG: "", proteinG: "" };

function meal(items: Partial<FoodDraft>[], extra: Partial<MealDraft> = {}): MealDraft {
  return {
    name: "Afternoon meal 1",
    items: items.map((item) => ({ ...BLANK, ...item })),
    starred: false,
    ...extra,
  };
}

function errorsOf(draft: MealDraft): Record<string, string> {
  const result = mealInputSchema.safeParse(draft);
  return result.success ? {} : issuesByPath(result.error.issues);
}

describe("targets", () => {
  it("reads the target, the split and grams per kilogram", () => {
    const parsed = parseForm(
      targetsInputSchema,
      form({ dailyKcal: " 2400 ", split: "body_weight", proteinPerKg: "1,8" }),
    );
    expect(parsed).toEqual({
      success: true,
      data: { dailyKcal: 2400, proteinPerKg: 1.8, split: "body_weight" },
    });
  });

  it("keeps whole kilocalories and tenths of a gram", () => {
    const parsed = parseForm(
      targetsInputSchema,
      form({ dailyKcal: "2399.6", split: "fixed_55_25_20", proteinPerKg: "2.04" }),
    );
    expect(parsed.success && parsed.data).toEqual({
      dailyKcal: 2400,
      proteinPerKg: 2,
      split: "fixed_55_25_20",
    });
  });

  it("says what is missing or out of bounds, against its own field", () => {
    const missing = parseForm(targetsInputSchema, form({ split: "body_weight" }));
    expect(!missing.success && missing.state.fieldErrors).toEqual({
      dailyKcal: "Enter your daily target.",
      proteinPerKg: "Enter grams per kg.",
    });
    const bounds = parseForm(
      targetsInputSchema,
      form({ dailyKcal: "20000", split: "body_weight", proteinPerKg: "9" }),
    );
    expect(!bounds.success && bounds.state.fieldErrors).toEqual({
      dailyKcal: "Enter a target between 500 and 10,000 kcal.",
      proteinPerKg: "Enter between 0.5 and 4 g per kg.",
    });
    const split = parseForm(
      targetsInputSchema,
      form({ dailyKcal: "2400", split: "keto", proteinPerKg: "1.8" }),
    );
    expect(!split.success && split.state.fieldErrors?.split).toBe("Choose how to split it.");
  });
});

describe("a meal", () => {
  it("needs only the energy, so a guessed meal is one number", () => {
    const parsed = mealInputSchema.parse(meal([{ kcal: "900" }]));
    expect(parsed).toEqual({
      mealId: undefined,
      name: "Afternoon meal 1",
      items: [{ name: null, kcal: 900, carbsG: null, fatG: null, proteinG: null }],
      starred: false,
    });
  });

  it("reads every field of a food, a decimal comma included, to the tenth", () => {
    const parsed = mealInputSchema.parse(
      meal(
        [
          {
            name: " Peanut butter, 75 g ",
            kcal: "441,54",
            carbsG: "15",
            fatG: "37.5",
            proteinG: "18.75",
          },
        ],
        { starred: true },
      ),
    );
    expect(parsed.items).toEqual([
      { name: "Peanut butter, 75 g", kcal: 441.5, carbsG: 15, fatG: 37.5, proteinG: 18.8 },
    ]);
    expect(parsed.starred).toBe(true);
  });

  it("passes over rows left blank, and keeps the order of the rest", () => {
    const parsed = mealInputSchema.parse(
      meal([{ name: "Milk", kcal: "160" }, BLANK, { name: "Oats", kcal: "150" }, BLANK]),
    );
    expect(parsed.items.map((item) => item.name)).toEqual(["Milk", "Oats"]);
  });

  it("puts each error on the row and field it belongs to", () => {
    expect(
      errorsOf(
        meal([
          { name: "Milk", kcal: "160" },
          BLANK,
          { name: "Toast" },
          { kcal: "abc", proteinG: "2000" },
        ]),
      ),
    ).toEqual({
      "items.2.kcal": "Enter the kcal.",
      "items.3.kcal": "Enter a number.",
      "items.3.proteinG": "At most 1,000 g.",
    });
  });

  it("asks for the energy on the first row when nothing was entered at all", () => {
    expect(errorsOf(meal([BLANK]))).toEqual({ "items.0.kcal": "Enter the kcal." });
    expect(errorsOf(meal([]))).toEqual({ "items.0.kcal": "Enter the kcal." });
  });

  it("needs a name for the meal, and a real id for one being edited", () => {
    expect(errorsOf(meal([{ kcal: "100" }], { name: "   " }))).toEqual({
      name: "Name this meal.",
    });
    expect(errorsOf(meal([{ kcal: "100" }], { mealId: "not-an-id" }))).toHaveProperty("mealId");
  });

  it("refuses more foods than a meal holds", () => {
    const many = Array.from({ length: 31 }, () => ({ kcal: "1" }));
    expect(errorsOf(meal(many))).toEqual({ items: "A meal holds at most 30 foods." });
  });
});
