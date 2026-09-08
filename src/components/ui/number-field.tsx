"use client";

import { stepValue } from "@/domain/sets";
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

/** Number entry with big minus/plus steppers and a keypad field, sized for gym use. */
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
      <div className="flex h-12 items-stretch overflow-hidden rounded-control border border-line bg-surface-raised">
        <button
          type="button"
          onClick={() => bump(-step)}
          disabled={disabled}
          aria-label={`Decrease ${label}`}
          className="w-10 shrink-0 text-xl text-ink-muted select-none active:bg-line disabled:opacity-40"
        >
          −
        </button>
        <input
          type="text"
          inputMode={inputMode}
          value={value}
          placeholder={ghost ?? ""}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-label={label}
          className="min-w-0 flex-1 bg-transparent text-center text-lg font-semibold tabular-nums placeholder:font-medium placeholder:text-ink-subtle/80 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => bump(step)}
          disabled={disabled}
          aria-label={`Increase ${label}`}
          className="w-10 shrink-0 text-xl text-ink-muted select-none active:bg-line disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}
