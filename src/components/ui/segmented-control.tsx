"use client";

import { Fragment, useState } from "react";

import { cn } from "@/lib/utils";

import { boldEmWidth } from "./fit";
import { foldStyles } from "./fold";

export type SegmentOption<V extends string> = {
  value: V;
  label: string;
  /** What the segment says aloud, where its label is an abbreviation ("1M": "1 month"). */
  accessibleLabel?: string;
};

type SegmentedControlProps<V extends string> = {
  name: string;
  options: readonly SegmentOption<V>[];
  /** Uncontrolled initial value. */
  defaultValue?: V;
  /** Controlled value; pair with `onChange`. */
  value?: V;
  onChange?: (value: V) => void;
  /**
   * Lets a chosen pill be tapped again to choose nothing, for a group that is optional. A radio
   * cannot be unchecked by itself, so an optional rating given by mistake would otherwise stay
   * given until the record was deleted.
   */
  clearable?: boolean;
  /** Preferred number of columns; wraps when the touch targets no longer fit. */
  columns?: number;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  id?: string;
};

/** Narrowest a pill can be and still hold a word like "Recovery" at 14px, plus its padding. */
const MIN_PILL = "4.75rem";

/**
 * What a segment needs on a row: its label on one line in bold at the tray's size (em), with a
 * hundredth to spare, and its padding; never under a target, nor under `MIN_PILL` where the
 * segments start from it.
 */
function segmentWidth(label: string, columns: boolean): string {
  const least = columns ? "var(--ov-target)" : `max(var(--ov-target), ${MIN_PILL})`;
  return `max(${least}, ${(boldEmWidth(label) * 1.01).toFixed(3)}em + 0.75rem)`;
}

/**
 * A segmented choice (DESIGN.md, Components): two to four words on a surface, the chosen one in
 * ink. A radio group, so it works without JavaScript; the label is the tap target.
 *
 * A label is never broken: a segment is never narrower than its words on one line ("30 days",
 * "Free weight") or a touch target. With columns, the segments share one row, the space beyond
 * their words split evenly; unspecified columns start each from a label-sized minimum instead.
 * Where they cannot all fit (a 320-pt phone, 200% text) the tray folds onto even rows (Fold,
 * Never Drop; fold.ts): four as two and two, five as three and two, never one alone under three.
 * Only a label wider than the whole tray wraps, between its words.
 */
export function SegmentedControl<V extends string>({
  name,
  options,
  defaultValue,
  value,
  onChange,
  clearable = false,
  columns,
  "aria-label": ariaLabel,
  ...accessibility
}: SegmentedControlProps<V>) {
  const controlled = value !== undefined;
  // A clearable group holds its own choice, so that tapping the chosen pill can let it go.
  const [chosen, setChosen] = useState<V | "">(defaultValue ?? "");
  const fold = foldStyles(options.map((option) => segmentWidth(option.label, Boolean(columns))));
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      {...accessibility}
      className="flex min-w-0 flex-wrap gap-[2px] rounded-control bg-surface p-[3px] text-[length:var(--ov-type-meta)]"
      style={fold.tray}
    >
      {options.map((option, index) => (
        <Fragment key={option.value}>
          {index > 0 && <span aria-hidden className="fold-break" style={fold.breaks[index - 1]} />}
          <label
            className="relative flex-1"
            // The automatic minimum is the segment's content: its label on one line, or a target.
            style={{ flexBasis: columns ? 0 : MIN_PILL, maxWidth: "100%" }}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              aria-label={option.accessibleLabel}
              className="peer sr-only"
              {...(controlled
                ? { checked: value === option.value, onChange: () => onChange?.(option.value) }
                : clearable
                  ? {
                      checked: chosen === option.value,
                      onChange: () => setChosen(option.value),
                      // A second press on the chosen pill fires a click and no change: the
                      // browser sees nothing to change. That press is what lets it go.
                      onClick: () =>
                        setChosen((current) => (current === option.value ? "" : current)),
                    }
                  : { defaultChecked: defaultValue === option.value })}
            />
            <span
              className={cn(
                "flex min-h-[var(--ov-target)] min-w-[var(--ov-target)] items-center justify-center rounded-[11px] px-1.5 py-1 text-[length:var(--ov-type-meta)] leading-tight font-bold text-ink transition-colors duration-[var(--ov-duration-feedback)] select-none",
                "peer-checked:bg-ink peer-checked:text-on-ink",
                "peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink",
              )}
            >
              <span
                className="segment-label text-center [overflow-wrap:break-word]"
                data-label={option.label}
              >
                {option.label}
              </span>
            </span>
          </label>
        </Fragment>
      ))}
    </div>
  );
}
