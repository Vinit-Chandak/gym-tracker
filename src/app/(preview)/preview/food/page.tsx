import type { Metadata, Route } from "next";

import { FoodView } from "@/app/(app)/today/food/food-view";
import { MealView } from "@/app/(app)/today/food/[meal]/meal-view";
import {
  addUp,
  eaten,
  mealFromSlug,
  mealSlug,
  type Food,
  type Meal,
  type NutritionTargets,
} from "@/domain/nutrition";
import type {
  EntryRecord,
  FoodDay,
  FoodRecord,
  SavedMealRecord,
} from "@/server/repositories/nutrition";

import { PreviewShell } from "../../preview-shell";

export const metadata: Metadata = { title: "Preview · Food" };

const TODAY = "2026-09-25";
const TARGETS: NutritionTargets = { dailyKcal: 2300, proteinPerKg: 1.8, split: "body_weight" };

let ids = 0;
const id = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`;

function food(
  name: string,
  portion: [number, Food["unit"]],
  kcal: number,
  macros: [number, number, number] | null = null,
): FoodRecord {
  const [carbsG, fatG, proteinG] = macros ?? [null, null, null];
  return {
    id: id(),
    name,
    portionAmount: portion[0],
    unit: portion[1],
    kcal,
    carbsG,
    fatG,
    proteinG,
  };
}

const MILK = food("Milk", [100, "ml"], 52, [5, 2.5, 3.3]);
const DRY_FRUITS = food("Morning dry fruits", [1, "serving"], 150, [9, 11, 4]);
const WHEY = food("MuscleBlaze Biozyme whey", [1, "scoop"], 139, [5.6, 1.8, 25]);
const OATS = food("Oats", [100, "g"], 389, [66.3, 6.9, 16.9]);
const HOME_FOOD = food("Home food", [1, "serving"], 200);
const CHICKPEA = food("Cooked chickpea", [100, "g"], 165, [27.4, 2.6, 8.9]);
const FRUIT = food("Fruit", [1, "piece"], 60, [15, 0.2, 0.5]);
const SHAKE = food("Amul protein blueberry shake", [200, "ml"], 138, [12, 3, 15]);
const HIGH_PROTEIN_MILK = food("Amul high protein milk", [250, "ml"], 225, [20, 0.5, 35]);

/** My foods, the most lately eaten first. */
const FOODS = [FRUIT, CHICKPEA, HOME_FOOD, WHEY, DRY_FRUITS, MILK, OATS, HIGH_PROTEIN_MILK, SHAKE];

function entry(meal: Meal, from: FoodRecord, amount: number): EntryRecord {
  const { id: foodId, ...copy } = from;
  return { id: id(), eatenOn: TODAY, meal, foodId, ...copy, amount };
}

const DAY: EntryRecord[] = [
  entry("breakfast", MILK, 300),
  entry("breakfast", DRY_FRUITS, 1),
  entry("breakfast", WHEY, 1),
  entry("lunch", HOME_FOOD, 2),
  entry("lunch", CHICKPEA, 150),
  entry("afternoon_snack", FRUIT, 1),
];
const DINNER_OUT = [entry("dinner", HOME_FOOD, 4), entry("dinner", OATS, 150)];

const SAVED: SavedMealRecord[] = [
  {
    id: id(),
    name: "Post-workout shake",
    items: [
      { ...WHEY, foodId: WHEY.id, amount: 1.5 },
      { ...MILK, foodId: MILK.id, amount: 250 },
    ],
  },
  {
    id: id(),
    name: "Usual breakfast",
    items: DAY.filter((logged) => logged.meal === "breakfast").map(
      ({ id: _id, eatenOn: _day, meal: _meal, ...logged }) => logged,
    ),
  },
];

const previewMeal = (meal: Meal) => `/preview/food?meal=${mealSlug(meal)}` as Route;

/**
 * The Food screen against made-up data (ADRs 0032, 0033), in each of its states: `?state=first`
 * has no target yet, `empty` nothing eaten, `over` a day past its band, `noweight` an account with
 * no body weight to take protein from. The default is a day under way. `?meal=breakfast` (or any
 * other meal) is that meal's page, and `&state=new` shows it for an account with no foods yet.
 * Saving here goes nowhere: there is no account behind it.
 */
export default async function FoodPreviewPage(props: PageProps<"/preview/food">) {
  const { state, meal: slug } = await props.searchParams;
  const meal = typeof slug === "string" ? mealFromSlug(slug) : null;

  if (meal) {
    const fresh = state === "new";
    return (
      <PreviewShell tab="/today">
        <MealView
          today={TODAY}
          meal={meal}
          backHref="/preview/food"
          screen={{
            entries: fresh ? [] : DAY.filter((logged) => logged.meal === meal),
            foods: fresh ? [] : FOODS,
            savedMeals: fresh ? [] : SAVED,
          }}
        />
      </PreviewShell>
    );
  }

  const entries =
    state === "empty" || state === "first" ? [] : state === "over" ? [...DAY, ...DINNER_OUT] : DAY;
  const day: FoodDay = {
    targets: state === "first" ? null : TARGETS,
    entries,
    eaten: addUp(entries.map(eaten)),
  };
  return (
    <PreviewShell tab="/today">
      <FoodView
        today={TODAY}
        day={day}
        bodyWeightKg={state === "noweight" ? null : 74.5}
        unit="kg"
        mealHref={previewMeal}
      />
    </PreviewShell>
  );
}
