"use client";

import { useId } from "react";

import { buttonClassName } from "@/components/ui/button";
import { INPUT_CLASS } from "@/components/ui/input";
import {
  NUTRITION_LIMITS,
  quickAmounts,
  type FoodAmounts,
  type FoodUnit,
} from "@/domain/nutrition";
import { sanitizeNumberEntry } from "@/domain/sets";
import { formatKcal, formatMacros, formatPortion } from "@/lib/format";
import { FOOD_UNIT_LABELS, FOOD_UNIT_PLURALS } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** An amount as typed, when it is one worth scaling by: blank, nothing or not a number is not. */
export function typedAmount(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  return value.trim() === "" || !Number.isFinite(parsed) || parsed <= 0 ? null : parsed;
}

/** The unit after a typed amount: "g", or "scoops" unless it is exactly one. */
function unitAfter(unit: FoodUnit, amount: number | null): string {
  return (amount !== 1 && FOOD_UNIT_PLURALS[unit]) || FOOD_UNIT_LABELS[unit];
}

/**
 * How much of a food: a field in the food's own unit, with the amounts most often eaten a tap
 * away, from half a portion to two. The one the field holds is shown chosen, so "the usual" is
 * visible at a glance and a different amount is one tap or a few digits.
 */
export function AmountField({
  label,
  value,
  onChange,
  unit,
  portionAmount,
  error,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  unit: FoodUnit;
  /** The food's portion, which the quick amounts are shares of. */
  portionAmount: number;
  error?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const current = typedAmount(value);
  const errorId = `${id}-error`;
  return (
    <div className="min-w-0 space-y-2" data-field-error={error ? "true" : undefined}>
      <label htmlFor={id} className="block text-sm font-medium text-ink-muted">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) =>
            onChange(sanitizeNumberEntry(event.target.value, "decimal", NUTRITION_LIMITS.amount))
          }
          className={cn(
            INPUT_CLASS,
            "h-12 max-w-[12rem] text-lg font-medium tabular-nums",
            error && "border-danger",
          )}
        />
        <span className="min-w-0 text-lg text-ink-muted" aria-hidden>
          {unitAfter(unit, current)}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {quickAmounts(portionAmount).map((amount) => (
          <button
            key={amount}
            type="button"
            disabled={disabled}
            aria-pressed={current === amount}
            onClick={() => onChange(String(amount))}
            className={cn(
              buttonClassName("secondary", "sm"),
              "tabular-nums aria-pressed:border-accent aria-pressed:bg-accent-soft",
            )}
          >
            {formatPortion(amount, unit)}
          </button>
        ))}
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** What an amount comes to, kept in view above the button that logs it. */
export function Preview({ amounts }: { amounts: FoodAmounts }) {
  const macros = formatMacros(amounts);
  return (
    <div className="min-w-0">
      <p className="text-lg font-medium tabular-nums">
        {formatKcal(amounts.kcal)}
        <span className="text-sm font-normal text-ink-muted"> kcal</span>
      </p>
      {macros && <p className="text-xs text-ink-muted tabular-nums">{macros}</p>}
    </div>
  );
}
