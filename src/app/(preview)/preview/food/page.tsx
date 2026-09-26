import type { Metadata, Route } from "next";

import { FoodView, type FoodLinks } from "@/app/(app)/food/food-view";
import { MealView } from "@/app/(app)/food/[meal]/meal-view";
import { MealBuilder } from "@/app/(app)/food/my-foods/meals/meal-builder";
import { MyFoodsView } from "@/app/(app)/food/my-foods/my-foods-view";
import { TargetsForm } from "@/app/(app)/food/targets/targets-form";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
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
  Library,
  SavedMealRecord,
} from "@/server/repositories/nutrition";

import { PreviewShell } from "../../preview-shell";

export const metadata: Metadata = { title: "Preview · Food" };

const TODAY = "2026-09-25";
const TARGETS: NutritionTargets = { dailyKcal: 2300, proteinPerKg: 1.8, fatPercent: 25 };
const WEIGHT = 74.5;

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
const PANEER = food("Paneer", [100, "g"], 265, [1.2, 20.8, 18.3]);

/** My foods, the most lately eaten first. */
const FOODS = [
  FRUIT,
  CHICKPEA,
  HOME_FOOD,
  WHEY,
  DRY_FRUITS,
  MILK,
  OATS,
  HIGH_PROTEIN_MILK,
  SHAKE,
  PANEER,
];

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
/** By the evening: carbohydrate still under, fat past its target, protein reached. */
const EVENING = [
  entry("dinner", PANEER, 200),
  entry("dinner", OATS, 50),
  entry("evening_snack", HIGH_PROTEIN_MILK, 250),
  entry("evening_snack", WHEY, 1),
];

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

const LIBRARY: Library = { foods: FOODS, savedMeals: SAVED };
const EMPTY: Library = { foods: [], savedMeals: [] };

const LINKS: FoodLinks = {
  meal: (meal) => `/preview/food?meal=${mealSlug(meal)}` as Route,
  myFoods: "/preview/food?page=my-foods" as Route,
  targets: "/preview/food?page=targets" as Route,
};

/**
 * The Food screens against made-up data (ADRs 0032 to 0035). Saving here goes nowhere: there is
 * no account behind it.
 *
 * - The Food screen, with `?state=` `first` (no target yet), `empty` (nothing eaten), `over` (a
 *   day past its band), `evening` (fat past its target, protein reached) or `noweight` (no body
 *   weight to take protein from). The default is a day under way.
 * - `?meal=breakfast` (or any other meal) is that meal's page; `&state=new` shows it for an
 *   account with nothing in My foods.
 * - `?page=targets` is the Targets screen, and `&state=first` its first setting.
 * - `?page=my-foods` is My foods, and `&state=new` an empty one.
 * - `?page=meal` is a saved meal in My foods, and `&state=new` a new one.
 */
export default async function FoodPreviewPage(props: PageProps<"/preview/food">) {
  const { state, meal: slug, page } = await props.searchParams;
  const meal = typeof slug === "string" ? mealFromSlug(slug) : null;
  const fresh = state === "new";

  if (meal) {
    return (
      <PreviewShell tab="/food">
        <MealView
          today={TODAY}
          meal={meal}
          backHref="/preview/food"
          screen={{
            entries: fresh ? [] : DAY.filter((logged) => logged.meal === meal),
            ...(fresh ? EMPTY : LIBRARY),
          }}
        />
      </PreviewShell>
    );
  }

  if (page === "targets") {
    return (
      <PreviewShell tab="/food">
        <PageHeader title="Targets" backHref="/preview/food" />
        <PageContent>
          <TargetsForm
            targets={state === "first" ? null : TARGETS}
            bodyWeightKg={WEIGHT}
            unit="kg"
            goal="build_muscle"
            leaveTo="/preview/food"
          />
        </PageContent>
      </PreviewShell>
    );
  }

  if (page === "my-foods") {
    return (
      <PreviewShell tab="/food">
        <PageHeader title="My foods" backHref="/preview/food" />
        <PageContent>
          <MyFoodsView
            library={fresh ? EMPTY : LIBRARY}
            links={{
              newMeal: "/preview/food?page=meal&state=new" as Route,
              meal: () => "/preview/food?page=meal" as Route,
            }}
          />
        </PageContent>
      </PreviewShell>
    );
  }

  if (page === "meal") {
    const saved = fresh ? null : SAVED[1]!;
    return (
      <PreviewShell tab="/food">
        <PageHeader
          title={saved?.name ?? "New meal"}
          backHref={"/preview/food?page=my-foods" as Route}
        />
        <PageContent>
          <MealBuilder
            saved={saved}
            foods={FOODS}
            leaveTo={"/preview/food?page=my-foods" as Route}
          />
        </PageContent>
      </PreviewShell>
    );
  }

  const entries =
    state === "empty" || state === "first"
      ? []
      : state === "over"
        ? [...DAY, ...DINNER_OUT]
        : state === "evening"
          ? [...DAY, ...EVENING]
          : DAY;
  const day: FoodDay = {
    targets: state === "first" ? null : TARGETS,
    entries,
    eaten: addUp(entries.map(eaten)),
    library: state === "first" ? { foods: 0, meals: 0 } : { foods: FOODS.length, meals: 2 },
  };
  return (
    <PreviewShell tab="/food">
      <FoodView
        today={TODAY}
        day={day}
        bodyWeightKg={state === "noweight" ? null : WEIGHT}
        goal="build_muscle"
        links={LINKS}
      />
    </PreviewShell>
  );
}
