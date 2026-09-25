"use client";

import { useOptimistic, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Plus, Star } from "@/components/ui/icons";
import { Section } from "@/components/ui/section";
import { SwipeRow } from "@/components/ui/swipe-row";
import { formatFoodAmount } from "@/lib/format";
import { attempted } from "@/lib/offline-submit";
import { deleteMealAction } from "@/server/actions/nutrition";
import type { MealRecord } from "@/server/repositories/nutrition";

import { MealSheet } from "./meal-sheet";

/**
 * A meal's foods are listed unless the only one is the meal itself: a guessed takeaway logged as
 * one unnamed number, or a food named what the meal is called.
 */
function listsFoods(meal: MealRecord): boolean {
  const [only] = meal.items;
  return meal.items.length > 1 || (only?.name != null && only.name !== meal.name);
}

/** One meal's row: its name and energy, its foods, and what they come to. */
function MealLine({ meal }: { meal: MealRecord }) {
  const { totals } = meal;
  const hasMacros = meal.items.some(
    (item) => item.carbsG !== null || item.fatG !== null || item.proteinG !== null,
  );
  return (
    <>
      {/* The spaces between the parts are for the button's name, which a screen reader reads
          as one string; beside flex items they take no room on the screen. */}
      <span className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5 font-medium [overflow-wrap:anywhere]">
          {meal.name}{" "}
          {meal.savedMealId && <Star role="img" className="text-accent" aria-label="Starred" />}
        </span>{" "}
        <span className="shrink-0 font-medium tabular-nums">
          {formatFoodAmount(totals.kcal)} kcal
        </span>
      </span>{" "}
      {listsFoods(meal) && (
        <span className="mt-1 block space-y-0.5 text-sm text-ink-muted">
          {meal.items.map((item, index) => (
            <span key={index} className="flex justify-between gap-3">
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {item.name ?? `Food ${index + 1}`}
              </span>{" "}
              <span className="shrink-0 tabular-nums">
                {formatFoodAmount(item.kcal)}
                <span className="sr-only"> kcal,</span>
              </span>
            </span>
          ))}
        </span>
      )}{" "}
      {hasMacros && (
        <span className="mt-1 block text-xs text-ink-subtle tabular-nums">
          Carbs {formatFoodAmount(totals.carbsG)} g · Fat {formatFoodAmount(totals.fatG)} g ·
          Protein {formatFoodAmount(totals.proteinG)} g
        </span>
      )}
    </>
  );
}

/**
 * Today's meals, and the way to add one (ADR 0032). A meal is edited by tapping it and deleted
 * by swiping it aside; the sheet it opens can delete it too, for anyone who does not swipe.
 */
export function MealsPanel({
  meals,
  suggestedName,
  primary = true,
}: {
  meals: readonly MealRecord[];
  suggestedName: string;
  /** Whether Add meal is the screen's primary action, which it is once a target is set. */
  primary?: boolean;
}) {
  // A new key for every opening mounts the sheet afresh; closing keeps the key, so the dialog
  // is closed where it is and hands the focus back to whatever opened it.
  const [sheet, setSheet] = useState<{ key: number; open: boolean; meal: MealRecord | null }>({
    key: 0,
    open: false,
    meal: null,
  });
  const openSheet = (meal: MealRecord | null) =>
    setSheet((current) => ({ key: current.key + 1, open: true, meal }));
  const closeSheet = () => setSheet((current) => ({ ...current, open: false }));

  // A deleted meal leaves the list at once; if the delete does not go through it comes back.
  const [shown, hide] = useOptimistic(meals, (current: readonly MealRecord[], id: string) =>
    current.filter((meal) => meal.id !== id),
  );
  const [error, setError] = useState<string | null>(null);
  const [, startDeleting] = useTransition();
  const remove = (meal: MealRecord) =>
    startDeleting(async () => {
      hide(meal.id);
      setError(null);
      const outcome = await attempted(
        () => deleteMealAction(meal.id),
        `${meal.name} was not deleted. Check your connection and try again.`,
      );
      if (!outcome.ok) setError(outcome.message);
      else if (!outcome.value.ok) setError(outcome.value.error ?? null);
    });

  return (
    <Section title="Meals">
      {shown.length === 0 ? (
        <p className="px-1 text-sm text-ink-muted">Nothing logged today.</p>
      ) : (
        <ul className="box-rows">
          {shown.map((meal) => (
            <li key={meal.id}>
              <SwipeRow
                action="Delete"
                actionLabel={`Delete ${meal.name}`}
                onAction={() => remove(meal)}
              >
                <button
                  type="button"
                  onClick={() => openSheet(meal)}
                  className="block w-full px-4 py-3 text-left transition-colors duration-[var(--ov-duration-feedback)] focus-visible:-outline-offset-2 active:bg-surface-raised"
                >
                  <MealLine meal={meal} />
                </button>
              </SwipeRow>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="px-1 text-sm text-danger">
          {error}
        </p>
      )}
      <Button
        size="lg"
        variant={primary ? "primary" : "secondary"}
        className="w-full"
        onClick={() => openSheet(null)}
      >
        <Plus aria-hidden />
        Add meal
      </Button>
      <MealSheet
        key={sheet.key}
        open={sheet.open}
        meal={sheet.meal}
        suggestedName={suggestedName}
        onClose={closeSheet}
      />
    </Section>
  );
}
