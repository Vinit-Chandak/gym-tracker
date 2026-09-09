"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import type { SegmentOption } from "./segmented-control";

/** One continuous tab strip; narrow screens scroll instead of creating an orphan row. */
export function Tabs<V extends string>({
  name,
  options,
  value,
  onChange,
  label,
}: {
  name: string;
  options: readonly SegmentOption<V>[];
  value: V;
  onChange: (value: V) => void;
  label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex min-w-0 [scrollbar-width:thin] overflow-x-auto border-b border-line"
    >
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={(element) => {
            refs.current[index] = element;
          }}
          type="button"
          role="tab"
          id={`${name}-${option.value}-tab`}
          aria-controls={`${name}-panel`}
          aria-selected={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            const next =
              event.key === "ArrowRight"
                ? (index + 1) % options.length
                : event.key === "ArrowLeft"
                  ? (index - 1 + options.length) % options.length
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? options.length - 1
                      : null;
            if (next === null) return;
            event.preventDefault();
            onChange(options[next]!.value);
            refs.current[next]?.focus();
          }}
          className={cn(
            "min-h-11 flex-1 shrink-0 border-b-2 px-[clamp(0.5rem,2vw,1.25rem)] py-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:-outline-offset-4",
            value === option.value
              ? "border-accent text-accent"
              : "border-transparent text-ink-muted hover:text-ink",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
