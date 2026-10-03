"use client";

import { useId, useState, type ReactNode } from "react";

import { sanitizeNumberEntry } from "@/domain/sets";

import { emWidth } from "./fit";
import { Glyph } from "./glyphs";

/**
 * A step from `current` in `direction`, on the steps from zero, a typed figure between two of
 * them going to the nearer one that way; null past the ends. From blank only + steps, one step
 * past the least: nothing is assumed about an answer not given.
 */
export function steppedValue(
  current: number | null,
  step: number,
  direction: 1 | -1,
  { min = 0, max = Number.POSITIVE_INFINITY }: { min?: number; max?: number } = {},
): number | null {
  if (!(step > 0)) return null;
  if (current === null) return direction > 0 && min + step <= max ? min + step : null;
  const at = current / step;
  const index = direction > 0 ? Math.floor(at + 1e-6) + 1 : Math.ceil(at - 1e-6) - 1;
  const next = Math.round(index * step * 100) / 100;
  return next < min || next > max ? null : next;
}

/** A figure as typed, read as a number: blank or not a number is none. */
function parseNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A figure in a row (boards Check-in, Log a ride): the name and its hint at the gutter, then −,
 * the figure in a column of its own, and +, so the buttons line up row under row whatever the
 * figure. The figure is typed in place, as the entry's are; − and + step it. Blank stays blank
 * until something is given: a stepper does not answer for anyone.
 *
 * Where the name and the stepper cannot share a line (320 pt, large text), the stepper folds
 * under the name, at the end.
 */
export function RowStepper({
  label,
  hint,
  name,
  defaultValue = "",
  value: controlled,
  onChange,
  unit,
  onUnit,
  step,
  min = 0,
  max,
  inputMode = "decimal",
  parse = parseNumber,
  format = String,
  sanitize,
  placeholder = "–",
  less,
  more,
  error,
}: {
  label: string;
  hint?: ReactNode;
  name?: string;
  defaultValue?: string;
  /** Controlled value; pair with `onChange`. */
  value?: string;
  onChange?: (value: string) => void;
  unit?: string;
  /** The unit as a control: what pressing it does, said aloud ("Distance in miles"). */
  onUnit?: { label: string; onPress: () => void };
  step: number;
  min?: number;
  max: number;
  inputMode?: "decimal" | "numeric" | "text";
  /** How the figure is read and written: a number by default, a time for a duration. */
  parse?: (value: string) => number | null;
  format?: (value: number) => string;
  /** Keeps typing to what the figure can hold; numbers by default. */
  sanitize?: (raw: string) => string;
  placeholder?: string;
  /** What − and + do, said aloud: "Half an hour less". */
  less: string;
  more: string;
  error?: string;
}) {
  const id = useId();
  const [own, setOwn] = useState(defaultValue);
  const value = controlled ?? own;
  const set = (next: string) => {
    if (controlled === undefined) setOwn(next);
    onChange?.(next);
  };
  const current = parse(value);
  const down = steppedValue(current, step, -1, { min, max });
  const up = steppedValue(current, step, 1, { min, max });
  const clean =
    sanitize ??
    ((raw: string) =>
      sanitizeNumberEntry(raw, inputMode === "numeric" ? "numeric" : "decimal", max));
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <div className="row-stepper" data-field-error={error ? "true" : undefined}>
      <span className="row-stepper-text">
        <label htmlFor={id} className="font-bold [overflow-wrap:anywhere]">
          {label}
        </label>
        {hint && (
          <span id={hintId} className="row-stepper-hint">
            {hint}
          </span>
        )}
        {error && (
          <span id={errorId} role="alert" className="type-meta-small font-semibold">
            {error}
          </span>
        )}
      </span>
      <span className="row-stepper-control">
        <button
          type="button"
          aria-label={less}
          disabled={down === null}
          onClick={() => down !== null && set(format(down))}
          className="round-button"
        >
          <Glyph name="minus" className="glyph-20" />
        </button>
        <span className="row-stepper-figure">
          <input
            id={id}
            name={name}
            type="text"
            inputMode={inputMode}
            autoComplete="off"
            value={value}
            placeholder={placeholder}
            aria-invalid={error ? true : undefined}
            aria-describedby={
              [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined
            }
            onChange={(event) => set(clean(event.target.value))}
            onFocus={(event) => {
              const input = event.currentTarget;
              requestAnimationFrame(() => input.select());
            }}
            className="figure-input"
            style={{ width: `${Math.max(0.9, emWidth(value || placeholder)) + 0.08}em` }}
          />
          {unit &&
            (onUnit ? (
              <button
                type="button"
                aria-label={onUnit.label}
                onClick={onUnit.onPress}
                className="row-stepper-unit row-stepper-unit-button"
              >
                {unit}
              </button>
            ) : (
              <span aria-hidden className="row-stepper-unit">
                {unit}
              </span>
            ))}
        </span>
        <button
          type="button"
          aria-label={more}
          disabled={up === null}
          onClick={() => up !== null && set(format(up))}
          className="round-button"
        >
          <Glyph name="plus" className="glyph-20" />
        </button>
      </span>
    </div>
  );
}
