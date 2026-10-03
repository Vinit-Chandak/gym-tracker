"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";

import type { BowlMeal } from "@/components/art/geometry";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { scaleFood, type Food, type Meal } from "@/domain/nutrition";
import { formatKcal, formatMacros, formatPortion } from "@/lib/format";
import { attempted, OFFLINE_SUBMIT_MESSAGE } from "@/lib/offline-submit";
import { deleteEntryAction, logFoodAction, updateEntryAction } from "@/server/actions/nutrition";

import { AmountField, Preview, typedAmount } from "@/components/food/amount-field";
import type { MealTotal } from "@/components/food/food-summary";

/**
 * What the sheet changes: a food from My foods logged in a meal, or an entry already there. A
 * food is corrected on My foods' own screen (ADR 0035), so nothing here opens it.
 */
export type PortionTarget =
  | { kind: "log"; foodId: string; eatenOn: string; meal: Meal; mealLabel: string }
  | { kind: "entry"; entryId: string };

/** The day a portion goes into: its meals in the order they are eaten, and its target. */
export type FoodDayBowl = { meals: readonly MealTotal[]; targetKcal: number | null };

/**
 * The day's meals as the bowl fills with them, the portion on top, thinned until it is logged
 * (board Portion). A portion that changes an entry takes the entry's own kcal out of its meal
 * first, so the bowl shows the day as it will be.
 */
export function bowlWithPortion(
  day: FoodDayBowl,
  meal: Meal,
  kcal: number,
  replacing = 0,
): BowlMeal[] {
  const logged = day.meals.flatMap((total) => {
    const left = total.meal === meal ? total.kcal - replacing : total.kcal;
    return left > 0.05 ? [{ kcal: left }] : [];
  });
  return kcal > 0 ? [...logged, { kcal, pending: true }] : logged;
}

/**
 * How much of a food (ADR 0033; board Portion): what the food's portion holds, the amount eaten
 * in the food's own unit, and what that comes to, worked out as it is typed, beside the day's
 * bowl with it in. The figures scale; nothing else needs saying.
 *
 * Mounted afresh for every opening, so it always starts from the food it was opened for.
 */
export function PortionSheet({
  open,
  onClose,
  food,
  amount,
  target,
  day,
  meal,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  /** The food from My foods, or the copy the entry was logged with. */
  food: Food;
  /** The amount the sheet opens with: the food's portion, or what the entry holds. */
  amount: number;
  target: PortionTarget;
  /** The day it goes into and the meal, for the bowl; none in a preview without a day. */
  day?: FoodDayBowl;
  meal: Meal;
  /** Said once the change is made; `added` when a food went into the meal. */
  onDone: (said: string, added: boolean) => void;
}) {
  const formId = useId();
  const [value, setValue] = useState(String(amount));
  // Stable across retries: a save whose reply was lost cannot log the food twice.
  const [submissionKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [removing, startRemoving] = useTransition();
  const content = useRef<HTMLFormElement>(null);
  const busy = saving || removing;
  const current = typedAmount(value);
  const macros = formatMacros(food);
  const amounts = scaleFood(food, current ?? 0);
  // An entry being changed is in the day already, at the amount it opened with.
  const replacing = target.kind === "entry" ? scaleFood(food, amount).kcal : 0;
  const filled =
    day && day.targetKcal !== null ? bowlWithPortion(day, meal, amounts.kcal, replacing) : null;
  const dayKcal = filled?.reduce((sum, layer) => sum + layer.kcal, 0) ?? 0;

  // A refused amount is where the eye and the caret go.
  useEffect(() => {
    if (error && !busy)
      content.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [error, busy]);

  const save = () =>
    startSaving(async () => {
      setFormError(null);
      const outcome = await attempted(
        () =>
          target.kind === "log"
            ? logFoodAction({
                submissionKey,
                eatenOn: target.eatenOn,
                meal: target.meal,
                foodId: target.foodId,
                amount: value,
              })
            : updateEntryAction({ entryId: target.entryId, amount: value }),
        OFFLINE_SUBMIT_MESSAGE,
      );
      if (!outcome.ok) {
        setFormError(outcome.message);
        return;
      }
      if (outcome.value.ok) {
        const portion = formatPortion(current ?? 0, food.unit);
        onDone(
          target.kind === "log"
            ? `${food.name}, ${portion}, added to ${target.mealLabel}.`
            : `${food.name} changed to ${portion}.`,
          target.kind === "log",
        );
        onClose();
        return;
      }
      setError(outcome.value.fieldErrors?.amount);
      setFormError(outcome.value.error ?? null);
    });

  const remove = () =>
    startRemoving(async () => {
      if (target.kind !== "entry") return;
      setFormError(null);
      const outcome = await attempted(
        () => deleteEntryAction(target.entryId),
        OFFLINE_SUBMIT_MESSAGE,
      );
      if (!outcome.ok) setFormError(outcome.message);
      else if (!outcome.value.ok) setFormError(outcome.value.error ?? null);
      else {
        onDone(`${food.name} removed.`, false);
        onClose();
      }
    });

  return (
    <Sheet
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      dismissible={!busy}
      title={food.name}
      footer={
        <div className="space-y-3">
          <Preview
            amounts={amounts}
            bowl={
              filled && day?.targetKcal
                ? {
                    meals: filled,
                    target: day.targetKcal,
                    label: `The bowl with ${food.name} in: ${formatKcal(dayKcal)} of ${formatKcal(day.targetKcal)} kcal`,
                  }
                : undefined
            }
          />
          {formError && (
            <p role="alert" className="type-meta-small font-semibold">
              {formError}
            </p>
          )}
          <Button type="submit" form={formId} size="lg" className="w-full" disabled={busy}>
            {target.kind === "log"
              ? saving
                ? "Adding…"
                : `Add to ${target.mealLabel}`
              : saving
                ? "Saving…"
                : "Save"}
          </Button>
        </div>
      }
    >
      <form
        id={formId}
        ref={content}
        className="space-y-4 pb-1"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) save();
        }}
      >
        <p className="type-meta-small text-ink-2 tabular-nums">
          Per {formatPortion(food.portionAmount, food.unit)} · {formatKcal(food.kcal)} kcal
          {macros && ` · ${macros}`}
        </p>
        <AmountField
          label="Amount eaten"
          value={value}
          onChange={setValue}
          unit={food.unit}
          portionAmount={food.portionAmount}
          name={food.name}
          error={error}
          disabled={busy}
        />
        {target.kind === "entry" && (
          <Button variant="danger" className="w-full" disabled={busy} onClick={remove}>
            {removing ? "Removing…" : "Remove from meal"}
          </Button>
        )}
      </form>
    </Sheet>
  );
}
