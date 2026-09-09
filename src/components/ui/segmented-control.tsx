"use client";

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
  columns?: number;
  "aria-label"?: string;
};

/**
 * Radio group rendered as large pills. Works without JavaScript because it is a real
 * radio input; the label is the tap target.
 */
export function SegmentedControl<V extends string>({
  name,
  options,
  defaultValue,
  value,
  onChange,
  columns,
  "aria-label": ariaLabel,
}: SegmentedControlProps<V>) {
  const controlled = value !== undefined;
  const cols = columns ?? Math.min(options.length, 3);
  // Below 400px more than three pills cannot hold a word like "Recovery"; halve the row there.
  const narrowCols = cols > 3 ? Math.ceil(cols / 2) : cols;
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid grid-cols-[repeat(var(--seg-narrow),minmax(0,1fr))] gap-2 min-[400px]:grid-cols-[repeat(var(--seg-cols),minmax(0,1fr))]"
      style={
        { "--seg-cols": cols, "--seg-narrow": narrowCols } as React.CSSProperties & {
          "--seg-cols": number;
          "--seg-narrow": number;
        }
      }
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
              : { defaultChecked: defaultValue === option.value })}
          />
          <span
            className={cn(
              "flex min-h-11 items-center justify-center overflow-hidden rounded-control border border-line bg-surface-raised px-1.5 py-1 text-sm leading-tight font-medium text-ink-muted select-none",
              "peer-checked:border-accent peer-checked:bg-accent/15 peer-checked:text-accent",
              "peer-focus-visible:ring-2 peer-focus-visible:ring-accent/60",
            )}
          >
            <span className="min-w-0 text-center break-words hyphens-auto">{option.label}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
