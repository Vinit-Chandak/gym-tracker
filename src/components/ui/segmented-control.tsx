"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

export type SegmentOption<V extends string> = { value: V; label: string };

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
  /** Force an exact number of columns. Omit and the row fits as many as the labels allow. */
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
 * Radio group rendered as large pills. Works without JavaScript because it is a real
 * radio input; the label is the tap target.
 *
 * The row wraps by measurement rather than at a guessed breakpoint: `auto-fit` packs in as
 * many pills as fit at `MIN_PILL` and puts the rest on the next line. A screen-width
 * breakpoint would have to be re-guessed every time a tab is added or renamed — which is
 * exactly what happened when Progress grew a fifth tab.
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
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      {...accessibility}
      className="grid gap-1 rounded-control bg-surface-raised p-1"
      style={{
        gridTemplateColumns: columns
          ? `repeat(${columns}, minmax(0, 1fr))`
          : `repeat(auto-fit, minmax(${MIN_PILL}, 1fr))`,
      }}
    >
      {options.map((option) => (
        <label key={option.value} className="relative">
          <input
            type="radio"
            name={name}
            value={option.value}
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
              "flex min-h-11 items-center justify-center rounded-control border border-transparent px-1 py-1 text-sm leading-tight font-medium text-ink-muted transition-colors duration-[var(--ov-duration-feedback)] select-none",
              "peer-checked:border-line-strong peer-checked:bg-accent-soft peer-checked:text-ink",
              "peer-focus-visible:ring-2 peer-focus-visible:ring-focus",
            )}
          >
            {/* Hyphenate a long word if it must wrap; never split it at an arbitrary letter. */}
            <span className="min-w-0 text-center hyphens-auto">{option.label}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
