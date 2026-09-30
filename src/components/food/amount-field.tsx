"use client";

import { useId } from "react";

import { buttonClassName } from "@/components/ui/button";
import {
  NUTRITION_LIMITS,
  quickAmounts,
  type FoodAmounts,
  type FoodUnit,
} from "@/domain/nutrition";
import { sanitizeNumberEntry } from "@/domain/sets";
import { formatKcal, formatPortion } from "@/lib/format";
import { FOOD_UNIT_LABELS, FOOD_UNIT_PLURALS } from "@/lib/labels";
import { cn } from "@/lib/utils";

import { macroLine } from "./food-text";

/** An amount as typed, when it is one worth scaling by: blank, nothing or not a number is not. */
export function typedAmount(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  return value.trim() === "" || !Number.isFinite(parsed) || parsed <= 0 ? null : parsed;
}

/** The amount's type: the display face, large, so the number being chosen leads the sheet. */
const AMOUNT_TYPE =
  "overflow-hidden font-display text-display-l leading-none font-extrabold whitespace-pre tabular-nums";

/** The unit after a typed amount: "g", or "scoops" unless it is exactly one. */
function unitAfter(unit: FoodUnit, amount: number | null): string {
  return (amount !== 1 && FOOD_UNIT_PLURALS[unit]) || FOOD_UNIT_LABELS[unit];
}

/**
 * How much of a food: the amount as the big number in a well, in the food's own unit, with the
 * amounts most often eaten a tap away, from half a portion to two. The one the well holds is
 * shown chosen in food's colour, so "the usual" is visible at a glance and a different amount is
 * one tap or a few digits.
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
      <label htmlFor={id} className="block text-sm font-semibold text-ink-muted">
        {label}
      </label>
      {/* The whole well is the field's target and takes its focus ring, as a set's wells do. */}
      <label
        htmlFor={id}
        className={cn(
          "flex min-w-0 cursor-text items-baseline gap-2 rounded-control bg-surface-raised px-4 transition-colors duration-[var(--ov-duration-feedback)] focus-within:bg-surface focus-within:ring-2 focus-within:ring-accent",
          error && "ring-2 ring-danger",
          disabled && "opacity-50",
        )}
      >
        {/* The amount is exactly as wide as its digits, so the unit reads straight after it: an
            unseen copy of the digits in the same cell sets the width the field then fills. */}
        <span className="inline-grid min-w-0">
          <span
            aria-hidden
            className={cn(AMOUNT_TYPE, "invisible col-start-1 row-start-1 self-center pr-1")}
          >
            {value || "0"}
          </span>
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
              AMOUNT_TYPE,
              // No width of its own, so the copy alone sizes the cell, which the field then fills.
              "col-start-1 row-start-1 h-[4.5rem] w-0 min-w-full bg-transparent text-ink focus:outline-none",
            )}
          />
        </span>
        <span className="text-lg font-semibold text-ink-muted" aria-hidden>
          {unitAfter(unit, current)}
        </span>
      </label>
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
              "tabular-nums aria-pressed:bg-food aria-pressed:text-on-food",
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

/** What an amount comes to, kept in view above the button that logs it: kcal as the figure. */
export function Preview({ amounts }: { amounts: FoodAmounts }) {
  const macros = macroLine(amounts);
  return (
    <div className="min-w-0">
      <p className="tabular-nums">
        <span className="font-display text-display-m font-extrabold">
          {formatKcal(amounts.kcal)}
        </span>{" "}
        <span className="font-semibold text-ink-muted">kcal</span>
      </p>
      {macros && <p className="mt-0.5 text-sm text-ink-muted tabular-nums">{macros}</p>}
    </div>
  );
}
