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
      <span className="block truncate text-xs text-ink-subtle">{label}</span>
      <div className="grid grid-cols-2 overflow-hidden rounded-control border border-line-strong bg-surface">
        <button
          type="button"
          onClick={() => bump(-step)}
          disabled={disabled}
          aria-label={`Decrease ${label}`}
          className="order-2 h-11 border-t border-r border-line text-lg text-ink-muted select-none active:bg-surface-raised disabled:opacity-40"
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
          className="order-1 col-span-2 h-11 w-full min-w-0 bg-transparent text-center text-[length:var(--ov-text-input)] font-medium tabular-nums placeholder:font-normal placeholder:text-ink-subtle focus:outline-none"
        />
        <button
          type="button"
          onClick={() => bump(step)}
          disabled={disabled}
          aria-label={`Increase ${label}`}
          className="order-3 h-11 border-t border-line text-lg text-ink-muted select-none active:bg-surface-raised disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}
