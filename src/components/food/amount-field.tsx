"use client";

import { useId } from "react";

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
 * How much of a food: a cell in the food's own unit, with the amounts most often eaten a tap
 * away, from half a portion to two, as a row of cells on one track. The one the field holds is
 * under the highlighter, so "the usual" is visible at a glance and a different amount is one tap
 * or a few digits. They are buttons rather than radios because the typed amount may match none.
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
            "h-12 max-w-[12rem] font-data text-lg font-semibold tabular-nums",
            error && "border-danger",
          )}
        />
        <span className="min-w-0 font-data text-lg text-ink-muted" aria-hidden>
          {unitAfter(unit, current)}
        </span>
      </div>
      <div
        role="group"
        aria-label="Quick amounts"
        className="flex min-w-0 flex-wrap gap-1 rounded-control border border-line bg-surface-raised p-1"
      >
        {quickAmounts(portionAmount).map((amount) => (
          <button
            key={amount}
            type="button"
            disabled={disabled}
            aria-pressed={current === amount}
            onClick={() => onChange(String(amount))}
            className={cn(
              "flex min-h-10 min-w-0 flex-[1_1_4rem] items-center justify-center rounded-control px-1 py-1 font-data text-sm font-semibold text-ink-muted tabular-nums select-none",
              "transition-[background-color,color,transform] duration-[var(--ov-duration-feedback)] ease-[var(--ov-ease-out)] active:scale-[0.98]",
              "focus-visible:-outline-offset-2 disabled:pointer-events-none disabled:opacity-45",
              "aria-pressed:bg-ink aria-pressed:text-canvas",
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
      {/* The space is for a screen reader, which reads the line as one string; beside flex
          items it takes no room on the screen. */}
      <p className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="measure text-xl">{formatKcal(amounts.kcal)}</span>{" "}
        <span className="font-data text-sm text-ink-muted">kcal</span>
      </p>
      {macros && <p className="mt-0.5 font-data text-xs text-ink-muted tabular-nums">{macros}</p>}
    </div>
  );
}
