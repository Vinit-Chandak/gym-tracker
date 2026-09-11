"use client";

import { Check, ChevronDown } from "@/components/ui/icons";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { PRESSABLE_ROW_CLASS } from "./link-row";
import { Sheet } from "./sheet";

export type SectionOption<V extends string> = { value: V; label: string };

/**
 * One screen's sections behind a single control, with whatever belongs to the whole screen
 * beside it — the filters, in practice.
 *
 * Five destinations as tabs cost two rows of a phone's width, which is a strip of chrome
 * taller than some of the panels underneath it. Naming only the section you are in takes
 * one row, and the rest arrive in the same bottom sheet the app already uses for a short
 * decision: anchored to the bottom edge, capped at 90dvh, never hanging off a narrow
 * screen, and identical on iOS and Android — which a native select is not.
 */
export function SectionSelect<V extends string>({
  label,
  options,
  value,
  onChange,
  action,
}: {
  /** Names the control and the sheet: "Progress section". */
  label: string;
  options: readonly SectionOption<V>[];
  value: V;
  onChange: (value: V) => void;
  /** A control belonging to the whole screen rather than to one section. */
  action?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={current ? `${label}: ${current.label}` : label}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-left font-medium transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised"
      >
        <span className="min-w-0 flex-1 truncate">{current?.label}</span>
        <ChevronDown
          className={cn(
            "shrink-0 text-ink-subtle transition-transform duration-[var(--ov-duration-feedback)]",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {action}
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <ul className="min-w-0 ruled-list">
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <li key={option.value}>
                <button
                  type="button"
                  aria-current={selected ? "true" : undefined}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={cn(PRESSABLE_ROW_CLASS, selected && "text-accent")}
                >
                  <span className="min-w-0 flex-1 font-medium">{option.label}</span>
                  {/* The tick, not colour alone, says which one you are looking at. */}
                  {selected && <Check className="shrink-0" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </div>
  );
}
