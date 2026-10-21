"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { sanitizeNumberEntry } from "@/domain/sets";

import { FigureInput } from "./figure-input";
import { emWidth, onRamp } from "./fit";
import { Glyph } from "./glyphs";
import { aboutLabel } from "./about-label";
import { InfoTip } from "./info-tip";

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

/** How wide the figure's field is, in em: its glyphs and a little over, never under 0.9. */
function figureEm(text: string): number {
  return Math.max(0.9, emWidth(text)) + 0.08;
}

/** A figure field's width for `text`, as a figure of its own or one part of one is drawn. */
export function figureWidth(text: string): string {
  return `${figureEm(text)}em`;
}

/** What a figure drawn in parts is given to draw them: the field the name labels, and how. */
export type FigureParts = {
  /** The first part's id: the name labels it, and a tap in the column types it. */
  id: string;
  describedBy?: string;
  invalid?: true;
  /** The figure's size where its column cannot hold it at 26; none at 26. */
  fontSize?: string;
};

/**
 * The figure's size (the Figures Never Truncate Rule): 26 at most, stepping down the ramp until
 * it fits the room its column leaves beside the unit, never under 20. `grow` is how much larger
 * than 26 a 26 is drawn here, by the reader's text size and the screen's width: at 200% text a
 * swim's 1640 with yd beside it steps to 20, where at 26 it ran into − and lost the edge of its
 * last digit, and so does 10000 at 1440, where a 26 is 29.
 */
export function figureSize(text: string, room: number, grow = 1): number {
  const fit = Math.floor(room / (figureEm(text) * grow));
  return onRamp(Math.max(20, Math.min(26, fit)));
}

/** A figure as typed, read as a number: blank or not a number is none. */
function parseNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A figure in a row (boards Check-in, Log a ride): the name, its ⓘ and under it the figure the
 * row makes or remembers (`hint`: "Last 7 h", never a sentence) at the gutter, then −,
 * the figure in a column of its own, and +, so the buttons line up row under row whatever the
 * figure. The figure is typed in place, as the entry's are; − and + step it, and it steps down
 * the ramp where its column cannot hold it beside its unit. Blank stays blank until something is
 * given: a stepper does not answer for anyone.
 *
 * Where the name and the stepper cannot share a line (a long name on a phone, large text), the
 * stepper folds under the name, at the end.
 *
 * A known limit: the figure steps no lower than the ramp's last figure size, 20, and a unit that
 * is a control keeps a whole target, so at 200% text a swim of 10000 yd meets − and +, and the
 * field's most, 100000, loses its last figure under yd.
 */
export function RowStepper({
  label,
  hint,
  info,
  aside,
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
  start,
  less,
  more,
  error,
  settle,
  figure,
}: {
  label: string;
  /** What the row's figure comes to or was last time ("Pace 6:46 /km"), never help. */
  hint?: ReactNode;
  /** Help for the row, behind a tip beside its name (The Need-to-Know Rule). */
  info?: ReactNode;
  /** A word after its name ("Optional"), read with the row as a field's aside is. */
  aside?: ReactNode;
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
  /**
   * Where − and + go from a blank: the last answer given (last night's hours), so a usual one is
   * a tap away. + lands on it and − one step under it; the blank itself still records nothing.
   */
  start?: number | null;
  /** What − and + do, said aloud: "Half an hour less". */
  less: string;
  more: string;
  error?: string;
  /** How a figure left as typed is written once its field is left: "0:75" as 1:15. */
  settle?: (value: string) => string;
  /**
   * The figure drawn in parts of its own (a distance's whole and what follows the point), in
   * place of one field. − and +, the name, the hint and the unit stay the row's.
   */
  figure?: (parts: FigureParts) => ReactNode;
}) {
  const id = useId();
  const [own, setOwn] = useState(defaultValue);
  const value = controlled ?? own;
  const shown = value || placeholder;
  // Drawn at 26 until its column is measured, and measured again as the text size or the
  // screen's width changes it. The column carries the 26 as its own font size (rows.css), so
  // what a 26 is drawn at here is read from the page rather than worked out again.
  const column = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(26);
  useLayoutEffect(() => {
    const element = column.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth;
      if (width <= 0) return;
      const style = getComputedStyle(element);
      const unit = element.querySelector<HTMLElement>(".row-stepper-unit");
      const gap = parseFloat(style.columnGap) || 0;
      const grow = (parseFloat(style.fontSize) || 26) / 26;
      setSize(figureSize(shown, width - (unit ? unit.offsetWidth + gap : 0), grow));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [shown]);
  const set = (next: string) => {
    if (controlled === undefined) setOwn(next);
    onChange?.(next);
  };
  const current = parse(value);
  const anchored = current === null && start != null && start >= min && start <= max;
  const down = anchored
    ? start - step >= min
      ? Math.round((start - step) * 100) / 100
      : null
    : steppedValue(current, step, -1, { min, max });
  const up = anchored ? start : steppedValue(current, step, 1, { min, max });
  const clean =
    sanitize ??
    ((raw: string) =>
      sanitizeNumberEntry(raw, inputMode === "numeric" ? "numeric" : "decimal", max));
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const asideId = `${id}-aside`;
  const describedBy =
    [aside ? asideId : null, hint ? hintId : null, error ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;
  // The ramp has no step between 26 and 20: stepped down, the figure is the 20.
  const fontSize = size < 26 ? "var(--ov-type-figure)" : undefined;

  return (
    <div className="row-stepper" data-field-error={error ? "true" : undefined}>
      <span className="row-stepper-text">
        {info || aside ? (
          <span className="flex flex-wrap items-center gap-x-1">
            <label htmlFor={id} className="max-w-full font-bold [overflow-wrap:break-word]">
              {label}
            </label>
            {info && <InfoTip label={aboutLabel(label)}>{info}</InfoTip>}
            {aside && (
              <span id={asideId} className="type-meta-small font-medium text-ink-2">
                {aside}
              </span>
            )}
          </span>
        ) : (
          <label htmlFor={id} className="font-bold [overflow-wrap:break-word]">
            {label}
          </label>
        )}
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
        {/* The whole column is the value's target: a tap beside the figure types it too. */}
        <span
          ref={column}
          className={figure ? "row-stepper-figure row-stepper-figure-parts" : "row-stepper-figure"}
          onClick={(event) => {
            if (event.target === event.currentTarget)
              (document.getElementById(id) as HTMLInputElement | null)?.focus();
          }}
        >
          {figure ? (
            figure({ id, describedBy, invalid: error ? true : undefined, fontSize })
          ) : (
            <FigureInput
              id={id}
              name={name}
              inputMode={inputMode}
              value={value}
              placeholder={placeholder}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy}
              onChange={(event) => set(clean(event.target.value))}
              onBlur={
                settle
                  ? () => {
                      const settled = settle(value);
                      if (settled !== value) set(settled);
                    }
                  : undefined
              }
              style={{ width: figureWidth(shown), fontSize }}
            />
          )}
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
