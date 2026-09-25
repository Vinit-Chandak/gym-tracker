"use client";

import { useOptimistic, useState, useTransition, useSyncExternalStore } from "react";
import {
  foodDraftSnapshot,
  subscribeFoodDrafts,
  removeFoodDraft,
  notifyFoodDrafts,
  type FoodLocalDraft,
} from "@/lib/food-drafts";

import { Button } from "@/components/ui/button";
import { Plus, Star } from "@/components/ui/icons";
import { Section } from "@/components/ui/section";
import { SwipeRow } from "@/components/ui/swipe-row";
import { formatFoodAmount, formatKcal } from "@/lib/format";
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
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="flex min-w-0 items-center gap-1.5 font-medium [overflow-wrap:anywhere]">
          {meal.name}{" "}
          {meal.savedMealId && <Star role="img" className="text-accent" aria-label="Starred" />}
        </span>{" "}
        <span className="shrink-0 font-medium tabular-nums">{formatKcal(totals.kcal)} kcal</span>
      </span>{" "}
      {listsFoods(meal) && (
        <span className="mt-1 block space-y-0.5 text-sm text-ink-muted">
          {meal.items.map((item, index) => (
            <span key={index} className="flex justify-between gap-3">
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {item.name ?? `Food ${index + 1}`}
              </span>{" "}
              <span className="shrink-0 tabular-nums">
                {formatKcal(item.kcal)}
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
  userId,
  today,
  meals,
  suggestedName,
  primary = true,
}: {
  userId?: string;
  today?: string;
  meals: readonly MealRecord[];
  suggestedName: string;
  /** Whether Add meal is the screen's primary action, which it is once a target is set. */
  primary?: boolean;
}) {
  // A new key for every opening mounts the sheet afresh; closing keeps the key, so the dialog
  // is closed where it is and hands the focus back to whatever opened it.
  const drafts: FoodLocalDraft[] = JSON.parse(
    useSyncExternalStore(
      subscribeFoodDrafts,
      () => foodDraftSnapshot(userId),
      () => "[]",
    ),
  );
  const [notice, setNotice] = useState("");
  const [sheet, setSheet] = useState<{
    key: number;
    open: boolean;
    meal: MealRecord | null;
    draft?: FoodLocalDraft;
  }>({
    key: 0,
    open: false,
    meal: null,
  });
  const openSheet = (meal: MealRecord | null, draft?: FoodLocalDraft) =>
    setSheet((current) => ({
      key: current.key + 1,
      open: true,
      meal,
      draft:
        draft ??
        drafts.find((d) => (meal ? d.mealId === meal.id : !d.mealId && d.eatenOn === today)),
    }));
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
      {drafts.length > 0 && (
        <div className="box space-y-3 panel-padding">
          <p className="text-sm text-ink-muted">Unsaved meals on this device</p>
          {drafts.map((draft) => (
            <div key={draft.submissionKey} className="space-y-2">
              <p className="text-sm [overflow-wrap:anywhere]">
                {draft.name || "Meal"} · {draft.eatenOn}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => openSheet(meals.find((m) => m.id === draft.mealId) ?? null, draft)}
                >
                  Resume draft
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    try {
                      removeFoodDraft(localStorage, draft);
                      notifyFoodDrafts();
                    } catch {
                      setNotice("Could not remove the draft from this device.");
                    }
                  }}
                >
                  Discard draft
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {notice && (
        <p role="status" className="text-sm text-ink-muted">
          {notice}
        </p>
      )}
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
        userId={userId}
        today={today}
        draft={sheet.draft}
        onSaved={(date) => setNotice(`Meal saved for ${date}.`)}
        onClose={closeSheet}
      />
    </Section>
  );
}
