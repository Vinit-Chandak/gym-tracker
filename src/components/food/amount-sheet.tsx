"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import {
  NUTRITION_LIMITS,
  overLimit,
  scaleFood,
  toHundredth,
  type Food,
  type FoodAmounts,
} from "@/domain/nutrition";
import { formatKcal, formatMacros, formatPortion } from "@/lib/format";

import { AmountField, Preview, typedAmount } from "./amount-field";

const TOO_MUCH: Record<keyof FoodAmounts, string> = {
  kcal: `That comes to more than ${NUTRITION_LIMITS.itemKcal.toLocaleString("en-GB")} kcal.`,
  carbsG: `That comes to more than ${NUTRITION_LIMITS.itemGrams.toLocaleString("en-GB")} g of carbs.`,
  fatG: `That comes to more than ${NUTRITION_LIMITS.itemGrams.toLocaleString("en-GB")} g of fat.`,
  proteinG: `That comes to more than ${NUTRITION_LIMITS.itemGrams.toLocaleString("en-GB")} g of protein.`,
};

/** What is wrong with an amount as typed, in the words the server would use; null when nothing. */
function amountProblem(food: Food, value: string): string | null {
  if (value.trim() === "") return "Enter how much.";
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return "Enter a number.";
  const amount = toHundredth(parsed);
  if (amount <= 0) return "Enter more than 0.";
  if (amount > NUTRITION_LIMITS.amount) {
    return `At most ${NUTRITION_LIMITS.amount.toLocaleString("en-GB")}.`;
  }
  const tooMuch = overLimit(food, amount);
  return tooMuch ? TOO_MUCH[tooMuch] : null;
}

/**
 * How much of a food goes into a meal being built in My foods (ADR 0035). The same field and
 * quick amounts as logging a food, but nothing is saved from here: the meal keeps the amount
 * until Save meal, so the sheet only checks it and hands it back.
 */
export function AmountSheet({
  open,
  onClose,
  food,
  amount,
  submitLabel,
  onSubmit,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  food: Food;
  /** The amount the sheet opens with. */
  amount: number;
  submitLabel: string;
  onSubmit: (amount: number) => void;
  /** Takes the food back out of the meal, for a food already in it. */
  onRemove?: () => void;
}) {
  const formId = useId();
  const [value, setValue] = useState(String(amount));
  const [error, setError] = useState<string>();
  const content = useRef<HTMLFormElement>(null);
  const current = typedAmount(value);
  const macros = formatMacros(food);

  useEffect(() => {
    if (error) content.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [error]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={food.name}
      footer={
        <div className="space-y-3">
          <Preview amounts={scaleFood(food, current ?? 0)} />
          <Button type="submit" form={formId} size="lg" className="w-full">
            {submitLabel}
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
          const problem = amountProblem(food, value);
          if (problem) {
            setError(problem);
            return;
          }
          onSubmit(toHundredth(Number(value.replace(",", "."))));
          onClose();
        }}
      >
        <p className="text-sm text-ink-muted tabular-nums">
          Per {formatPortion(food.portionAmount, food.unit)}
          <br />
          {formatKcal(food.kcal)} kcal{macros && ` · ${macros}`}
        </p>
        <AmountField
          label="Amount"
          value={value}
          onChange={(next) => {
            setValue(next);
            setError(undefined);
          }}
          unit={food.unit}
          portionAmount={food.portionAmount}
          error={error}
        />
        {onRemove && (
          <Button
            variant="danger"
            className="w-full"
            onClick={() => {
              onRemove();
              onClose();
            }}
          >
            Remove from meal
          </Button>
        )}
      </form>
    </Sheet>
  );
}
