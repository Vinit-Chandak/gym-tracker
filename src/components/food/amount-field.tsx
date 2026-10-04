"use client";

import { useId } from "react";

import { Art } from "@/components/art/art";
import type { BowlMeal } from "@/components/art/geometry";
import { FigureInput } from "@/components/ui/figure-input";
import { emWidth } from "@/components/ui/fit";
import { Glyph } from "@/components/ui/glyphs";
import { NUTRITION_LIMITS, toHundredth, type FoodAmounts, type FoodUnit } from "@/domain/nutrition";
import { sanitizeNumberEntry } from "@/domain/sets";
import { formatKcal, formatMacros } from "@/lib/format";
import { FOOD_UNIT_LABELS, FOOD_UNIT_PLURALS } from "@/lib/labels";

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
 * The amount a step up or down from `current`, on the half portions (the amounts the app has
 * always offered a tap away: half a portion, the portion, one and a half, two, and on). A typed
 * amount between two of them steps to the nearer one that way. Null where there is none.
 */
export function steppedAmount(
  current: number,
  portionAmount: number,
  direction: 1 | -1,
): number | null {
  const step = portionAmount / 2;
  if (!(step > 0)) return null;
  const at = current / step;
  const index = direction > 0 ? Math.floor(at + 1e-6) + 1 : Math.ceil(at - 1e-6) - 1;
  const next = toHundredth(index * step);
  return next > 0 && next <= NUTRITION_LIMITS.amount ? next : null;
}

/**
 * How much of a food (board Portion): the amount in the food's own unit, written as the entry
 * writes its figures and typed the same way, between − and +, which step by half a portion.
 */
export function AmountField({
  label,
  value,
  onChange,
  unit,
  portionAmount,
  name,
  error,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  unit: FoodUnit;
  /** The food's portion, which the steps are halves of. */
  portionAmount: number;
  /** The food's name, which − and + say they change. */
  name?: string;
  error?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const current = typedAmount(value);
  const errorId = `${id}-error`;
  const less = current === null ? null : steppedAmount(current, portionAmount, -1);
  const more = steppedAmount(current ?? 0, portionAmount, 1);
  const what = name?.trim() ? ` ${name.trim()}` : "";
  return (
    <div className="min-w-0" data-field-error={error ? "true" : undefined}>
      <label htmlFor={id} className="block type-meta-small font-bold">
        {label}
      </label>
      <div className="amount-stepper">
        <button
          type="button"
          aria-label={`Less${what}`}
          disabled={disabled || less === null}
          onClick={() => less !== null && onChange(String(less))}
          className="round-button"
        >
          <Glyph name="minus" className="glyph-20" />
        </button>
        <span className="amount-figure">
          <FigureInput
            id={id}
            inputMode="decimal"
            value={value}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) =>
              onChange(sanitizeNumberEntry(event.target.value, "decimal", NUTRITION_LIMITS.amount))
            }
            style={{ width: `${Math.max(0.9, emWidth(value || "0")) + 0.08}em` }}
          />
          <span className="amount-unit" aria-hidden>
            {unitAfter(unit, current)}
          </span>
        </span>
        <button
          type="button"
          aria-label={`More${what}`}
          disabled={disabled || more === null}
          onClick={() => more !== null && onChange(String(more))}
          className="round-button"
        >
          <Glyph name="plus" className="glyph-20" />
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="type-meta-small font-semibold">
          {error}
        </p>
      )}
    </div>
  );
}

/** The day's bowl with a portion in it, thinned until it is logged (board Portion). */
export type PortionBowl = { meals: readonly BowlMeal[]; target: number; label: string };

/**
 * What an amount comes to, kept in view above the button that logs it: its kcal and macros,
 * beside the day's bowl with it in where there is a day and a target to fill.
 */
export function Preview({ amounts, bowl }: { amounts: FoodAmounts; bowl?: PortionBowl }) {
  const macros = formatMacros(amounts);
  return (
    <div className="food-preview">
      {bowl && (
        <Art
          kind="bowl"
          meals={bowl.meals}
          target={bowl.target}
          label={bowl.label}
          maxRadius={40}
          pad={5}
          rimWidth={2.5}
          className="food-preview-bowl"
        />
      )}
      <div className="min-w-0">
        <p className="whitespace-nowrap">
          <span className="type-figure-l">{formatKcal(amounts.kcal)}</span>{" "}
          <span className="food-preview-unit">kcal</span>
        </p>
        {macros && (
          <p className="type-meta-small [overflow-wrap:anywhere] text-ink-2 tabular-nums">
            {macros}
          </p>
        )}
      </div>
    </div>
  );
}
