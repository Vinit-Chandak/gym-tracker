"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { scaleFood, type Food, type Meal } from "@/domain/nutrition";
import { formatKcal, formatMacros, formatPortion } from "@/lib/format";
import { attempted, OFFLINE_SUBMIT_MESSAGE } from "@/lib/offline-submit";
import { deleteEntryAction, logFoodAction, updateEntryAction } from "@/server/actions/nutrition";

import { AmountField, Preview, typedAmount } from "@/components/food/amount-field";

/**
 * What the sheet changes: a food from My foods logged in a meal, or an entry already there. A
 * food is corrected on My foods' own screen (ADR 0035), so nothing here opens it.
 */
export type PortionTarget =
  | { kind: "log"; foodId: string; eatenOn: string; meal: Meal; mealLabel: string }
  | { kind: "entry"; entryId: string };

/**
 * How much of a food (ADR 0033): the food's portion and what it holds, the amount eaten in the
 * food's own unit, and what that comes to, worked out as it is typed. The figures scale; nothing
 * else needs saying.
 *
 * Mounted afresh for every opening, so it always starts from the food it was opened for.
 */
export function PortionSheet({
  open,
  onClose,
  food,
  amount,
  target,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  /** The food from My foods, or the copy the entry was logged with. */
  food: Food;
  /** The amount the sheet opens with: the food's portion, or what the entry holds. */
  amount: number;
  target: PortionTarget;
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
          <Preview amounts={scaleFood(food, current ?? 0)} />
          {formError && (
            <p role="alert" className="text-sm text-danger">
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
        <p className="text-sm text-ink-muted tabular-nums">
          Per {formatPortion(food.portionAmount, food.unit)}
          <br />
          {formatKcal(food.kcal)} kcal{macros && ` · ${macros}`}
        </p>
        <AmountField
          label="Amount eaten"
          value={value}
          onChange={setValue}
          unit={food.unit}
          portionAmount={food.portionAmount}
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
