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
   * Lets a chosen segment be tapped again to choose nothing, for a group that is optional. A
   * radio cannot be unchecked by itself, so an optional rating given by mistake would
   * otherwise stay given until the record was deleted.
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

/** Narrowest a segment can be and still hold a word like "Recovery" at 14px, plus its padding. */
const MIN_SEGMENT = "4.75rem";

/**
 * Radio group drawn as a row of cells on a raised track; the chosen cell takes the
 * highlighter. Works without JavaScript because it is a real radio input; the label is the
 * tap target.
 *
 * Preferred columns share a row until each would be narrower than a touch target. Flex
 * wrapping responds to the available space and enlarged text.
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
  // A clearable group holds its own choice, so that tapping the chosen cell can let it go.
  const [chosen, setChosen] = useState<V | "">(defaultValue ?? "");
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      {...accessibility}
      className="flex min-w-0 flex-wrap gap-1 rounded-control border border-line bg-surface-raised p-1"
    >
      {options.map((option) => (
        <label
          key={option.value}
          className="relative flex-1"
          style={{
            flexBasis: columns
              ? `calc((100% - ${(columns - 1) * 0.25}rem) / ${columns})`
              : MIN_SEGMENT,
            minWidth: `min(100%, ${columns ? "var(--ov-target-min)" : MIN_SEGMENT})`,
          }}
        >
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
                    // A second press on the chosen cell fires a click and no change: the
                    // browser sees nothing to change. That press is what lets it go.
                    onClick: () =>
                      setChosen((current) => (current === option.value ? "" : current)),
                  }
                : { defaultChecked: defaultValue === option.value })}
          />
          <span
            className={cn(
              "flex min-h-10 items-center justify-center rounded-control px-1 py-1 text-sm leading-tight font-medium text-ink-muted transition-colors duration-[var(--ov-duration-feedback)] select-none",
              "peer-checked:bg-highlight peer-checked:text-on-highlight",
              "peer-focus-visible:ring-2 peer-focus-visible:ring-focus",
            )}
          >
            <span className="min-w-0 text-center [overflow-wrap:anywhere] hyphens-auto">
              {option.label}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}
