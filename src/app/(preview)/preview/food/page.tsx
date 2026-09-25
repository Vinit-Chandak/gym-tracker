import type { Metadata } from "next";

import { FoodView } from "@/app/(app)/today/food/food-view";
import { addUp, type FoodItem, type NutritionTargets } from "@/domain/nutrition";
import type { FoodScreen, MealRecord } from "@/server/repositories/nutrition";

import { PreviewShell } from "../../preview-shell";

export const metadata: Metadata = { title: "Preview · Food" };

const TARGETS: NutritionTargets = { dailyKcal: 2400, proteinPerKg: 1.8, split: "body_weight" };

const STAR_ID = "00000000-0000-4000-8000-0000000000f1";

function meal(
  id: string,
  name: string,
  items: FoodItem[],
  savedMealId: string | null = null,
): MealRecord {
  return { id, name, eatenOn: "2026-09-25", savedMealId, items, totals: addUp(items) };
}

const MEALS: MealRecord[] = [
  meal(
    "00000000-0000-4000-8000-0000000000a1",
    "Morning meal 1",
    [
      { name: "Oats, 80 g", kcal: 303, carbsG: 54, fatG: 5.5, proteinG: 10.5 },
      { name: "Whey, 1 scoop", kcal: 120, carbsG: 3, fatG: 1.5, proteinG: 24 },
      { name: "Milk, 250 ml", kcal: 160, carbsG: 12, fatG: 8, proteinG: 8.5 },
    ],
    STAR_ID,
  ),
  meal("00000000-0000-4000-8000-0000000000a2", "Afternoon meal 1", [
    { name: "Peanut butter, 75 g", kcal: 441.5, carbsG: 15, fatG: 37.5, proteinG: 18.8 },
    { name: "Milk, 250 ml", kcal: 160, carbsG: 12, fatG: 8, proteinG: 8.5 },
  ]),
  // A guessed restaurant meal: one number and nothing else.
  meal("00000000-0000-4000-8000-0000000000a3", "Dinner at the Thai place", [
    { name: null, kcal: 1050, carbsG: null, fatG: null, proteinG: null },
  ]),
];

const SAVED: FoodScreen["savedMeals"] = [
  {
    id: STAR_ID,
    name: "Morning meal 1",
    items: MEALS[0]!.items,
    totals: MEALS[0]!.totals,
  },
  {
    id: "00000000-0000-4000-8000-0000000000f2",
    name: "Protein shake",
    items: [{ name: null, kcal: 280, carbsG: 15, fatG: 9.5, proteinG: 32.5 }],
    totals: { kcal: 280, carbsG: 15, fatG: 9.5, proteinG: 32.5 },
  },
  {
    id: "00000000-0000-4000-8000-0000000000f3",
    name: "Chicken, rice and broccoli",
    items: [{ name: null, kcal: 640, carbsG: 70, fatG: 12, proteinG: 55 }],
    totals: { kcal: 640, carbsG: 70, fatG: 12, proteinG: 55 },
  },
];

/**
 * The Food screen against made-up data (ADR 0032), in each of its states: `?state=first` has no
 * target yet, `empty` nothing eaten, `over` a day past its band, `noweight` an account with no
 * body weight to take protein from. The default is a day that has met its goal. Saving here
 * goes nowhere: there is no account behind it.
 */
export default async function FoodPreviewPage(props: PageProps<"/preview/food">) {
  const { state } = await props.searchParams;
  const extra = meal("00000000-0000-4000-8000-0000000000a4", "Evening meal 1", [
    { name: "Pizza, half", kcal: 1100, carbsG: 120, fatG: 45, proteinG: 48 },
  ]);
  const screen: FoodScreen = {
    targets: state === "first" ? null : TARGETS,
    meals:
      state === "empty" || state === "first" ? [] : state === "over" ? [...MEALS, extra] : MEALS,
    savedMeals: state === "first" ? [] : SAVED,
  };

  return (
    <PreviewShell tab="/today">
      <FoodView
        today="2026-09-25"
        screen={screen}
        bodyWeightKg={state === "noweight" ? null : 74.5}
        unit="kg"
        suggestedName="Evening meal 1"
      />
    </PreviewShell>
  );
}
