"use client";

import { useState, type CSSProperties } from "react";

import { Check, ChevronRight } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";
import {
  contributions,
  macroState,
  type FoodTotals,
  type LoggedFood,
  type MacroKey,
  type MacroState,
  type MacroTargets,
  type Meal,
} from "@/domain/nutrition";
import { formatFoodAmount, formatPortion } from "@/lib/format";
import { MEAL_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** In the order the split names them: 55 / 25 / 20 is carbohydrate, fat, protein. */
const MACROS = [
  { key: "carbsG", label: "Carbs", fill: "bg-series-2" },
  { key: "fatG", label: "Fat", fill: "bg-series-4" },
  { key: "proteinG", label: "Protein", fill: "bg-series-3" },
] as const satisfies readonly { key: MacroKey; label: string; fill: string }[];

/** A glyph beside a label a size smaller than the controls': sized here, since icons size by CSS. */
const SMALL_GLYPH: CSSProperties = { width: "0.875rem", height: "0.875rem" };

/** A macronutrient's bar: its own colour while under, green once protein is reached, red past. */
const STATE_FILL: Record<MacroState, string | null> = {
  under: null,
  reached: "bg-success",
  over: "bg-over",
};

/** Whole grams, as every macro summary is; a trace of something reads as less than one. */
function grams(value: number): string {
  return value > 0 && Math.round(value) === 0 ? "<1" : formatFoodAmount(value);
}

export type EatenEntry = LoggedFood & { meal: Meal };

/**
 * Grams eaten against grams set, one thin bar each, each opening what the day's foods gave to it
 * (ADR 0035). Carbohydrate and fat turn red past their targets; protein is a minimum, so reaching
 * it turns it green with a tick. The numbers are written above every bar, so the bars are left out
 * of the accessibility tree rather than read out a second time.
 */
export function MacroBars({
  eaten,
  target,
  entries,
}: {
  eaten: FoodTotals;
  target: MacroTargets;
  /** Everything eaten today, which each breakdown ranks. */
  entries: readonly EatenEntry[];
}) {
  // A new key for every opening mounts the sheet afresh; closing keeps the key, so the dialog is
  // closed where it is and hands the focus back to whatever opened it.
  const [sheet, setSheet] = useState<{ key: number; open: boolean; macro: MacroKey | null }>({
    key: 0,
    open: false,
    macro: null,
  });
  const chosen = MACROS.find((macro) => macro.key === sheet.macro);

  return (
    <>
      <ul className="grid grid-cols-3 gap-2" aria-label="Carbs, fat and protein">
        {MACROS.map(({ key, label, fill }) => {
          const state = macroState(key, eaten[key], target[key]);
          const share =
            target[key] > 0 ? Math.min(1, eaten[key] / target[key]) : eaten[key] > 0 ? 1 : 0;
          const stated = state === "over" ? ", over" : state === "reached" ? ", reached" : "";
          return (
            <li key={key} className="min-w-0">
              <button
                type="button"
                aria-haspopup="dialog"
                aria-label={`${label}: ${grams(eaten[key])} of ${formatFoodAmount(target[key])} g${stated}`}
                onClick={() =>
                  setSheet((current) => ({ key: current.key + 1, open: true, macro: key }))
                }
                className="-m-1.5 block w-[calc(100%+0.75rem)] rounded-control p-1.5 text-left transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised"
              >
                <span className="flex items-center gap-0.5 text-xs text-ink-muted">
                  {label}
                  {state === "reached" ? (
                    <Check style={SMALL_GLYPH} className="text-success" />
                  ) : (
                    <ChevronRight style={SMALL_GLYPH} className="text-ink-subtle" />
                  )}
                </span>
                <span
                  className={cn(
                    "mt-0.5 block text-sm tabular-nums",
                    state === "over" && "text-over",
                  )}
                >
                  {grams(eaten[key])}
                  <span className={state === "over" ? undefined : "text-ink-muted"}>
                    {" "}
                    / {formatFoodAmount(target[key])} g
                  </span>
                </span>
                <span
                  aria-hidden
                  className="mt-1.5 block h-1 overflow-hidden rounded-full bg-surface-raised"
                >
                  <span
                    className={cn("block h-full rounded-full", STATE_FILL[state] ?? fill)}
                    style={{ width: `${share * 100}%` }}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {chosen && (
        <MacroSheet
          key={sheet.key}
          open={sheet.open}
          onClose={() => setSheet((current) => ({ ...current, open: false }))}
          label={chosen.label}
          macro={chosen.key}
          fill={chosen.fill}
          eaten={eaten[chosen.key]}
          target={target[chosen.key]}
          entries={entries}
        />
      )}
    </>
  );
}

/**
 * One macronutrient's day: what was eaten against what was set, then each food by how much of it
 * it gave, the most first, with its share of the day. A food eaten twice is one row; a food logged
 * without the figure closes the list with a dash, since it is why a total may read low.
 */
function MacroSheet({
  open,
  onClose,
  label,
  macro,
  fill,
  eaten,
  target,
  entries,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  macro: MacroKey;
  fill: string;
  eaten: number;
  target: number;
  entries: readonly EatenEntry[];
}) {
  const rows = contributions(entries, macro);
  const left = Math.round(target) - Math.round(eaten);
  const state = macroState(macro, eaten, target);
  const against =
    left > 0
      ? ` · ${formatFoodAmount(left)} g to go`
      : state === "over"
        ? ` · ${-left} g over`
        : "";
  return (
    <Sheet open={open} onClose={onClose} title={label}>
      <div className="space-y-2 pb-1">
        <p className="text-sm text-ink-muted tabular-nums">
          {grams(eaten)} of {formatFoodAmount(target)} g{against}
        </p>
        {rows.length === 0 ? (
          <p className="py-2 text-sm text-ink-muted">Nothing yet today.</p>
        ) : (
          <ul className="ruled-list" aria-label={`${label} by food`}>
            {rows.map((row) => (
              <li
                key={`${row.name}-${row.unit}`}
                className="flex items-baseline justify-between gap-3 py-2.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block [overflow-wrap:anywhere]">{row.name}</span>{" "}
                  <span className="block text-sm text-ink-muted tabular-nums">
                    {row.meals.map((meal) => MEAL_LABELS[meal]).join(", ")} ·{" "}
                    {formatPortion(row.amount, row.unit)}
                  </span>
                  {row.share !== null && (
                    <span
                      aria-hidden
                      className="mt-1.5 block h-1 overflow-hidden rounded-full bg-surface-raised"
                    >
                      <span
                        className={cn("block h-full rounded-full", fill)}
                        style={{ width: `${row.share * 100}%` }}
                      />
                    </span>
                  )}
                </span>{" "}
                {row.grams === null ? (
                  <span className="shrink-0 text-ink-muted" aria-label="no figure">
                    —
                  </span>
                ) : (
                  <span className="shrink-0 text-right tabular-nums">
                    <span className="block font-medium">{grams(row.grams)} g</span>{" "}
                    <span className="block text-sm text-ink-muted">
                      {Math.round((row.share ?? 0) * 100)}%
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
