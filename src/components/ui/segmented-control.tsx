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
 * A segmented choice (DESIGN.md, Components): two to four words on a surface, the chosen one in
 * ink. A radio group, so it works without JavaScript; the label is the tap target.
 *
 * Preferred columns share a row until each would be narrower than a touch target. Flex
 * wrapping responds to the available space and enlarged text, including inside an auto-sized
 * unit selector. Unspecified columns use the label-sized minimum instead.
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
      className="flex min-w-0 flex-wrap gap-[2px] rounded-control bg-surface p-[3px]"
    >
      {options.map((option) => (
        <label
          key={option.value}
          className="relative flex-1"
          style={{
            flexBasis: columns ? `calc((100% - ${(columns - 1) * 2}px) / ${columns})` : MIN_PILL,
            minWidth: `min(100%, ${columns ? "var(--ov-target-min)" : MIN_PILL})`,
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
                    // A second press on the chosen pill fires a click and no change: the
                    // browser sees nothing to change. That press is what lets it go.
                    onClick: () =>
                      setChosen((current) => (current === option.value ? "" : current)),
                  }
                : { defaultChecked: defaultValue === option.value })}
          />
          <span
            className={cn(
              "flex min-h-[var(--ov-target)] items-center justify-center rounded-[11px] px-1.5 py-1 text-[length:var(--ov-type-meta)] leading-tight font-bold text-ink transition-colors duration-[var(--ov-duration-feedback)] select-none",
              "peer-checked:bg-ink peer-checked:text-on-ink",
              "peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink",
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
