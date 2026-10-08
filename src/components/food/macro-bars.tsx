"use client";

import { useState } from "react";

import { FoodRowText, RowFigure, RowGlyph } from "@/components/food/food-row";
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

/** In the order the split names them: 55 / 25 / 20 is carbohydrate, fat, protein. */
const MACROS = [
  { key: "carbsG", label: "Carbs" },
  { key: "fatG", label: "Fat" },
  { key: "proteinG", label: "Protein" },
] as const satisfies readonly { key: MacroKey; label: string }[];

/** Whole grams, as every macro summary is; a trace of something reads as less than one. */
function grams(value: number): string {
  return value > 0 && Math.round(value) === 0 ? "<1" : formatFoodAmount(value);
}

/** A food's grams in its row's column: whole, as kcal are there, so four digits always fit. */
function rowGrams(value: number): string {
  return value > 0 && Math.round(value) === 0 ? "<1" : String(Math.round(value) + 0);
}

/** How much of its rail a macronutrient fills, from 0 to 1. */
function filled(eaten: number, target: number): number {
  return target > 0 ? Math.min(1, eaten / target) : eaten > 0 ? 1 : 0;
}

/**
 * A macronutrient's rail (board Food): what was eaten in ink on a `control` line. Past a limit
 * the ink runs on past a tick at the target, the rail scaled to what was eaten, so it never
 * reads like the bowl's heap. The figures are written beside it, so it is left unread.
 */
function MacroRail({ state, eaten, target }: { state: MacroState; eaten: number; target: number }) {
  const over = state === "over" && eaten > 0;
  return (
    <span aria-hidden className="macro-rail">
      <span
        className="macro-rail-ink"
        style={{ width: `${(over ? 1 : filled(eaten, target)) * 100}%` }}
      />
      {over && <span className="macro-rail-tick" style={{ left: `${(target / eaten) * 100}%` }} />}
    </span>
  );
}

export type EatenEntry = LoggedFood & { meal: Meal };

/**
 * Grams eaten against grams set (ADR 0036; board Food): three columns, each the name, what was
 * eaten over its target as the app writes it ("86 / 297 g") and its rail, each opening what the
 * day's foods gave to it. Carbohydrate and fat are limits, protein a minimum: past a limit the
 * rail says so, and the name read aloud says over or reached.
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
      <ul className="food-macros" aria-label="Carbs, fat and protein">
        {MACROS.map(({ key, label }) => {
          const state = macroState(key, eaten[key], target[key]);
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
                className="food-macro"
              >
                <span className="food-macro-name">{label}</span>{" "}
                <span className="food-macro-figure">
                  <span className="type-figure-l">{grams(eaten[key])}</span>{" "}
                  <span className="food-macro-of">/ {formatFoodAmount(target[key])} g</span>
                </span>
                <MacroRail state={state} eaten={eaten[key]} target={target[key]} />
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
          eaten={eaten[chosen.key]}
          target={target[chosen.key]}
          entries={entries}
        />
      )}
    </>
  );
}

/**
 * One macronutrient's day (ADR 0036): what was eaten against what was set, on its rail, and where
 * that leaves the day in words, then each food by how much it gave, the most first. A food eaten
 * twice is one row; a food logged without the figure closes the list with a dash, since it is
 * why a total may read low.
 */
function MacroSheet({
  open,
  onClose,
  label,
  macro,
  eaten,
  target,
  entries,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  macro: MacroKey;
  eaten: number;
  target: number;
  entries: readonly EatenEntry[];
}) {
  const rows = contributions(entries, macro);
  const state = macroState(macro, eaten, target);
  const left = Math.round(target) - Math.round(eaten);
  // Protein is a minimum, so what is left of it is still to go; carbohydrate and fat are limits.
  const standing =
    state === "reached"
      ? "Reached"
      : state === "over"
        ? `${-left} g over`
        : left > 0
          ? `${formatFoodAmount(left)} g ${macro === "proteinG" ? "to go" : "left"}`
          : null;
  return (
    <Sheet open={open} onClose={onClose} title={label}>
      <div className="pb-1">
        <div className="macro-sheet-head">
          <p className="whitespace-nowrap">
            <span className="type-figure-l">{grams(eaten)}</span>{" "}
            <span className="macro-sheet-of">g of {formatFoodAmount(target)} g</span>
          </p>{" "}
          {standing && <p className="type-meta font-semibold tabular-nums">{standing}</p>}
        </div>
        <MacroRail state={state} eaten={eaten} target={target} />
        {rows.length === 0 ? (
          <p className="mt-4 type-meta text-ink-2">Nothing yet today.</p>
        ) : (
          <ul className="food-list mt-2" aria-label={`${label} by food`}>
            {rows.map((row) => (
              <li key={`${row.name}-${row.unit}`} className="food-row">
                <FoodRowText
                  name={row.name}
                  tile={<RowGlyph name="food" />}
                  meta={
                    <>
                      {row.meals.map((meal) => MEAL_LABELS[meal]).join(", ")} ·{" "}
                      <span>{formatPortion(row.amount, row.unit)}</span>
                    </>
                  }
                />{" "}
                {row.grams === null ? (
                  <span className="food-row-figure">
                    <span aria-hidden className="type-figure text-ink-2">
                      —
                    </span>
                    <span className="sr-only"> no figure</span>
                  </span>
                ) : (
                  <RowFigure figure={rowGrams(row.grams)} unit="g" />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
