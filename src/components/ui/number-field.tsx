"use client";

import { sanitizeNumberEntry, stepValue } from "@/domain/sets";
import { cn } from "@/lib/utils";

type NumberFieldProps = {
  label: string;
  /** Current entry; empty string shows the faint prefill instead. */
  value: string;
  /** Faint prefill from the previous comparable set; stepping starts from it. */
  ghost?: string;
  onChange: (value: string) => void;
  step: number;
  min?: number;
  max?: number;
  inputMode?: "decimal" | "numeric";
  disabled?: boolean;
  className?: string;
};

/**
 * Number entry with a keypad field and minus/plus steppers, sized for gym use.
 *
 * This is the form control — check-in readings, run distances. The set row uses the
 * compact single-line cell instead and keeps its steppers in the set options sheet, so a
 * logging screen is not three two-storey controls wide.
 */
export function NumberField({
  label,
  value,
  ghost,
  onChange,
  step,
  min = 0,
  max,
  inputMode = "decimal",
  disabled,
  className,
}: NumberFieldProps) {
  const from = ghost !== undefined && ghost !== "" ? Number(ghost) : null;
  const bump = (delta: number) => {
    const next = Number(stepValue(value, delta, from, min));
    onChange(String(max !== undefined ? Math.min(max, next) : next));
  };

  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <span className="block truncate text-xs font-medium text-ink-muted">{label}</span>
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-1 rounded-control bg-surface-raised p-1">
        <button
          type="button"
          onClick={() => bump(-step)}
          disabled={disabled}
          aria-label={`Decrease ${label}`}
          className="order-1 flex size-11 pressable items-center justify-center rounded-[0.625rem] bg-surface text-xl font-semibold text-ink select-none disabled:opacity-40"
        >
          −
        </button>
        <input
          type="text"
          maxLength={24}
          inputMode={inputMode}
          value={value}
          placeholder={ghost ?? ""}
          onChange={(event) => onChange(sanitizeNumberEntry(event.target.value, inputMode, max))}
          disabled={disabled}
          aria-label={label}
          className="order-2 h-11 w-full min-w-0 rounded-[0.625rem] bg-transparent text-center font-display text-[1.75rem] leading-none font-extrabold tabular-nums placeholder:font-bold placeholder:text-ink-ghost focus:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset"
        />
        <button
          type="button"
          onClick={() => bump(step)}
          disabled={disabled}
          aria-label={`Increase ${label}`}
          className="order-3 flex size-11 pressable items-center justify-center rounded-[0.625rem] bg-surface text-xl font-semibold text-ink select-none disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}
