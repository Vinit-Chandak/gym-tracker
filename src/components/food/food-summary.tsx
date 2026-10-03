import { Art } from "@/components/art/art";
import {
  addUp,
  eaten as eatenFrom,
  MEALS,
  type FoodTotals,
  type MacroTargets,
  type Meal,
} from "@/domain/nutrition";
import { formatKcal } from "@/lib/format";
import { MEAL_LABELS } from "@/lib/labels";

import { MacroBars, type EatenEntry } from "./macro-bars";

export type MealTotal = { meal: Meal; kcal: number };

/** Each meal with food in it, in the order they are eaten, and what it came to. */
export function mealTotals(entries: readonly EatenEntry[]): MealTotal[] {
  return MEALS.flatMap((meal) => {
    const inMeal = entries.filter((entry) => entry.meal === meal);
    return inMeal.length > 0 ? [{ meal, kcal: addUp(inMeal.map(eatenFrom)).kcal }] : [];
  });
}

/**
 * The bowl said aloud (board Food): its meals in the order they fill it, then the day against
 * its target, "heaped over its rim" once the day is past it.
 */
export function bowlLabel(meals: readonly MealTotal[], eaten: number, target: number): string {
  const bowl = eaten > target ? "The bowl heaped over its rim" : "The bowl";
  const filled =
    meals.length > 0
      ? `, filled by ${meals.map((meal) => `${MEAL_LABELS[meal.meal]} ${formatKcal(meal.kcal)} kcal`).join(", ")}`
      : ", empty";
  return `${bowl}${filled}: ${formatKcal(eaten)} of ${formatKcal(target)} kcal.`;
}

/**
 * The day at the top of the Food screen (ADR 0036; board Food): its one figure, the kcal
 * eaten, written against its target as the macronutrients are ("1,152.5 / 2,300 kcal"), then
 * the bowl, the target filled meal by meal and heaped past it, then the macronutrients. How far
 * the day is from its target is the bowl's to show, not a second figure; the target itself stays
 * on the first screen (the feature inventory's eaten-against-the-target). Without a target there
 * is no bowl to fill, so the figure stands alone.
 */
export function FoodSummary({
  eaten,
  target,
  entries,
}: {
  eaten: FoodTotals;
  target: MacroTargets | null;
  entries: readonly EatenEntry[];
}) {
  const meals = mealTotals(entries);
  return (
    <>
      <p className="food-eaten">
        <span className="type-figure-xl whitespace-nowrap">{formatKcal(eaten.kcal)}</span>{" "}
        <span className="food-eaten-unit">
          {target && (
            <span aria-hidden className="food-eaten-of">
              / {formatKcal(target.kcal)}{" "}
            </span>
          )}
          kcal
          <span className="sr-only"> eaten{target ? ` of ${formatKcal(target.kcal)}` : ""}</span>
        </span>
      </p>
      {target && (
        <>
          <figure className="mt-2">
            <Art
              kind="bowl"
              meals={meals}
              target={target.kcal}
              label={bowlLabel(meals, eaten.kcal, target.kcal)}
            />
          </figure>
          <MacroBars eaten={eaten} target={target} entries={entries} />
        </>
      )}
    </>
  );
}
