import type { FoodUnit } from "@/domain/nutrition";
import { formatFoodAmount, formatKcal, formatPortion } from "@/lib/format";

/**
 * The phrases the food screens write about a food. Each reads as one phrase joined by commas,
 * the way every meta line in the app does, rather than as parts set apart by dots.
 */

/** "Carbs 66 g, Fat 7 g, Protein 17 g", in whole grams, leaving out whatever is not known. */
export function macroLine(amounts: {
  carbsG: number | null;
  fatG: number | null;
  proteinG: number | null;
}): string {
  return (
    [
      ["Carbs", amounts.carbsG],
      ["Fat", amounts.fatG],
      ["Protein", amounts.proteinG],
    ] as const
  )
    .flatMap(([label, grams]) => (grams === null ? [] : [`${label} ${formatFoodAmount(grams)} g`]))
    .join(", ");
}

/** "100 g, 389 kcal": a food's portion and what that portion holds. */
export function portionLine(food: { portionAmount: number; unit: FoodUnit; kcal: number }): string {
  return `${formatPortion(food.portionAmount, food.unit)}, ${formatKcal(food.kcal)} kcal`;
}

/** "1 food", "3 foods". */
export function foodCount(count: number): string {
  return `${count} ${count === 1 ? "food" : "foods"}`;
}
