"use client";

import { useState, type CSSProperties } from "react";

import { ChevronRight } from "@/components/ui/icons";
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

/**
 * In the order the split names them: 55 / 25 / 20 is carbohydrate, fat, protein. All three are
 * food's own colour: the sports' colours mean sports everywhere else, and each row is named, so
 * no bar needs a hue of its own to be told apart.
 */
const MACROS = [
  { key: "carbsG", label: "Carbs", fill: "bg-food-ink", ink: "text-food-ink" },
  { key: "fatG", label: "Fat", fill: "bg-food-ink", ink: "text-food-ink" },
  { key: "proteinG", label: "Protein", fill: "bg-food-ink", ink: "text-food-ink" },
] as const satisfies readonly { key: MacroKey; label: string; fill: string; ink: string }[];

/** A glyph beside a label a size smaller than the controls': sized here, since icons size by CSS. */
const SMALL_GLYPH: CSSProperties = { width: "0.875rem", height: "0.875rem" };

/** A macronutrient's bar: its own colour while under, green once protein is reached, red past. */
const STATE_FILL: Record<MacroState, string | null> = {
  under: null,
  reached: "bg-success",
  over: "bg-over",
};

/** The same colours for the name, which takes its bar's colour once the target is eaten. */
const STATE_INK: Record<MacroState, string | null> = {
  under: null,
  reached: "text-success",
  over: "text-over",
};

/**
 * Whether the day has come to a macronutrient's target: protein reached, or a limit met or passed.
 * Compared in whole grams, as `macroState` is, so the name lights up as the numbers meet.
 */
function atTarget(state: MacroState, eaten: number, target: number): boolean {
  return state !== "under" || (Math.round(target) > 0 && Math.round(eaten) >= Math.round(target));
}

/** Whole grams, as every macro summary is; a trace of something reads as less than one. */
function grams(value: number): string {
  return value > 0 && Math.round(value) === 0 ? "<1" : formatFoodAmount(value);
}

/** How much of its bar a macronutrient fills, from 0 to 1. */
function filled(eaten: number, target: number): number {
  return target > 0 ? Math.min(1, eaten / target) : eaten > 0 ? 1 : 0;
}

export type EatenEntry = LoggedFood & { meal: Meal };

/**
 * Grams eaten against grams set, one row each (ADR 0036): the name, a bar, and the two numbers
 * lined up on the right, each row opening what the day's foods gave to it. Carbohydrate and fat
 * turn red past their targets; protein is a minimum, so reaching it turns it green. Once a row's
 * target is eaten its name takes its bar's colour, so a met target reads from the names alone.
 *
 * The rows share one grid (a subgrid each), so the numbers column is as wide as the widest
 * numbers and every bar is the same length, whatever the grams. Where a row is too narrow for all
 * four (a small phone, large text), the bar drops under the name and numbers, and the numbers
 * under the name if they still do not fit. The numbers are written on every row, so the bars are
 * left out of the accessibility tree rather than read out a second time.
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
      {/* The container is the card's width, which the list's own negative margins would not be. */}
      <div className="@container">
        <ul
          className="-mx-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 @2xs:grid-cols-[5rem_minmax(0,1fr)_auto_auto]"
          aria-label="Carbs, fat and protein"
        >
          {MACROS.map(({ key, label, fill, ink }) => {
            const state = macroState(key, eaten[key], target[key]);
            const stated = state === "over" ? ", over" : state === "reached" ? ", reached" : "";
            return (
              <li key={key} className="col-span-full grid grid-cols-subgrid">
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-label={`${label}: ${grams(eaten[key])} of ${formatFoodAmount(target[key])} g${stated}`}
                  onClick={() =>
                    setSheet((current) => ({ key: current.key + 1, open: true, macro: key }))
                  }
                  className="col-span-full grid min-h-10 w-full grid-cols-subgrid items-center gap-y-1.5 rounded-control px-2 py-2 text-left transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised @2xs:py-1"
                >
                  {/* The name and the numbers share a line while both fit, and the numbers wrap
                      under the name when they do not. On a row wide enough for the bar between
                      them, they are cells of the row itself. */}
                  <span className="[grid-column:1] [grid-row:1] flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 @2xs:contents">
                    <span
                      className={cn(
                        "text-sm @2xs:[grid-column:1] @2xs:[grid-row:1]",
                        atTarget(state, eaten[key], target[key])
                          ? (STATE_INK[state] ?? ink)
                          : "text-ink-muted",
                      )}
                    >
                      {label}
                    </span>
                    <span
                      className={cn(
                        "ml-auto text-right text-sm tabular-nums @2xs:[grid-column:3] @2xs:[grid-row:1]",
                        state === "over" && "text-over",
                      )}
                    >
                      <span className="font-semibold">{grams(eaten[key])}</span>{" "}
                      <span
                        className={cn(
                          "whitespace-nowrap",
                          state === "over" ? undefined : "text-ink-muted",
                        )}
                      >
                        / {formatFoodAmount(target[key])} g
                      </span>
                      {/* Said in words as well as in colour, which a filled card cannot show. */}
                      {state === "over" && <span className="font-semibold"> over</span>}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className="[grid-column:1/-1] [grid-row:2] block h-2 overflow-hidden rounded-full bg-surface-raised @2xs:[grid-column:2] @2xs:[grid-row:1]"
                  >
                    <span
                      className={cn("block h-full rounded-full", STATE_FILL[state] ?? fill)}
                      style={{ width: `${filled(eaten[key], target[key]) * 100}%` }}
                    />
                  </span>
                  <ChevronRight
                    style={SMALL_GLYPH}
                    className="[grid-column:2] [grid-row:1] text-ink-subtle @2xs:[grid-column:4]"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
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
 * One macronutrient's day (ADR 0036): what was eaten against what was set, with the one bar and
 * where that leaves the day in words, then each food by how much it gave, the most first, as rows
 * like the rest of the app. A food eaten twice is one row; a food logged without the figure closes
 * the list with a dash, since it is why a total may read low.
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
  const state = macroState(macro, eaten, target);
  const left = Math.round(target) - Math.round(eaten);
  // Protein is a minimum, so what is left of it is still to go; carbohydrate and fat are limits.
  const standing =
    state === "over"
      ? `${-left} g over`
      : state === "under" && left > 0
        ? `${formatFoodAmount(left)} g ${macro === "proteinG" ? "to go" : "left"}`
        : null;
  return (
    <Sheet open={open} onClose={onClose} title={label}>
      <div className="space-y-4 pb-1">
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p
              className={cn("text-2xl font-semibold tabular-nums", state === "over" && "text-over")}
            >
              {grams(eaten)} g
              <span
                className={cn(
                  "text-sm font-normal",
                  state === "over" ? undefined : "text-ink-muted",
                )}
              >
                {" "}
                of {formatFoodAmount(target)} g
              </span>
            </p>{" "}
            {state === "reached" ? (
              <p className="text-sm text-success">Reached</p>
            ) : (
              standing && (
                <p
                  className={cn(
                    "text-sm tabular-nums",
                    state === "over" ? "text-over" : "text-ink-muted",
                  )}
                >
                  {standing}
                </p>
              )
            )}
          </div>
          <span aria-hidden className="block h-2 overflow-hidden rounded-full bg-surface-raised">
            <span
              className={cn("block h-full rounded-full", STATE_FILL[state] ?? fill)}
              style={{ width: `${filled(eaten, target) * 100}%` }}
            />
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing yet today.</p>
        ) : (
          <ul className="ruled-list" aria-label={`${label} by food`}>
            {rows.map((row) => (
              <li
                key={`${row.name}-${row.unit}`}
                className="flex min-h-14 items-center gap-3 py-2.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold [overflow-wrap:anywhere]">{row.name}</span>{" "}
                  <span className="block text-sm text-ink-muted tabular-nums">
                    {row.meals.map((meal) => MEAL_LABELS[meal]).join(", ")} ·{" "}
                    <span className="whitespace-nowrap">{formatPortion(row.amount, row.unit)}</span>
                  </span>
                </span>{" "}
                {row.grams === null ? (
                  <span className="shrink-0 text-ink-muted">
                    <span aria-hidden>—</span>
                    <span className="sr-only"> no figure</span>
                  </span>
                ) : (
                  <span className="shrink-0 font-semibold tabular-nums">{grams(row.grams)} g</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
