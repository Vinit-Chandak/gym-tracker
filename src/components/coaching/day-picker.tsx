"use client";

import { cn } from "@/lib/utils";
import { WEEKDAY_NAMES, WEEKDAY_SHORT } from "@/lib/labels";

/** Seven chips instead of seven checkboxes: one row, one tap, and the week readable at once. */
export function DayPicker({
  legend,
  aside,
  selected,
  onChange,
}: {
  legend: string;
  /** A word at the end of the legend's line: "From your logs" (DESIGN.md, Need-to-Know). */
  aside?: string;
  selected: number[];
  onChange: (days: number[]) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 flex w-full flex-wrap items-center gap-x-1 text-sm font-medium text-ink-muted">
        <span className="max-w-full [overflow-wrap:break-word]">{legend}</span>
        {/* Read with the legend, as a field's aside is. */}
        {aside && <span className="ml-auto shrink-0 text-ink-2">{aside}</span>}
      </legend>
      <div className="grid grid-cols-4 gap-1 min-[480px]:grid-cols-7">
        {WEEKDAY_SHORT.slice(1).map((short, i) => {
          const day = i + 1;
          const on = selected.includes(day);
          return (
            <button
              key={short}
              type="button"
              aria-pressed={on}
              aria-label={WEEKDAY_NAMES[day]}
              onClick={() =>
                onChange(
                  on ? selected.filter((d) => d !== day) : [...selected, day].sort((a, b) => a - b),
                )
              }
              className={cn(
                "flex min-h-12 min-w-0 items-center justify-center rounded-control border text-sm font-medium transition-colors duration-[var(--ov-duration-feedback)]",
                on
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line-strong bg-surface text-ink-muted",
              )}
            >
              {short.slice(0, 1)}
              <span className="sr-only">{WEEKDAY_NAMES[day]}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
