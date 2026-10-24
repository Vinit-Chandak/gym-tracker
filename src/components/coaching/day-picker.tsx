"use client";

import { cn } from "@/lib/utils";
import { WEEKDAY_NAMES, WEEKDAY_SHORT } from "@/lib/labels";

/**
 * Seven chips instead of seven checkboxes: one row, one tap, and the week readable at once. The
 * row folds to four and three only where seven would each be narrower than a thumb (a 320-pt
 * phone, large text), never on an ordinary phone (onboarding.css). Each chip is drawn as a field
 * until it is chosen, then in ink.
 */
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
      <legend className="mb-1.5 flex w-full flex-wrap items-center gap-x-1 text-[length:var(--ov-type-meta-small)] font-bold text-ink">
        <span className="max-w-full [overflow-wrap:break-word]">{legend}</span>
        {/* Read with the legend, as a field's aside is. */}
        {aside && <span className="ml-auto shrink-0 text-ink-2">{aside}</span>}
      </legend>
      <div className="day-picker">
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
                "flex min-h-12 min-w-0 items-center justify-center rounded-control border text-[length:var(--ov-type-meta)] font-bold transition-colors duration-[var(--ov-duration-feedback)]",
                on ? "border-ink bg-ink text-on-ink" : "border-control bg-field text-ink",
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
