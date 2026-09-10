"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { SegmentOption } from "./segmented-control";

/** Narrowest a tab can be and still hold a word like "Recovery" at 14px, plus its padding. */
const MIN_TAB = "4.75rem";

/**
 * Tabs that wrap into equal-width rows rather than scrolling.
 *
 * A horizontal scroller hides destinations behind a gesture with no affordance, and at
 * 320px with five tabs there is always something off-screen. `auto-fit` packs in as many
 * as fit at their minimum and puts the rest on the next row, in the same order every time,
 * so nothing is clipped and no label has to shrink.
 *
 * `action` is a control that belongs to the whole panel rather than to one tab — the
 * filters, in practice. It sits at the trailing edge of the same rule the tabs sit on and
 * takes only its own width, so the tabs wrap around it instead of being pushed off.
 */
export function Tabs<V extends string>({
  name,
  options,
  value,
  onChange,
  label,
  action,
}: {
  name: string;
  options: readonly SegmentOption<V>[];
  value: V;
  onChange: (value: V) => void;
  label: string;
  action?: ReactNode;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className="flex min-w-0 items-end gap-1 border-b border-line">
      <div
        role="tablist"
        aria-label={label}
        className="grid min-w-0 flex-1"
        style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${MIN_TAB}, 1fr))` }}
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
              "min-h-11 min-w-0 border-b-2 px-2 py-2 text-sm font-medium transition-colors duration-[var(--ov-duration-feedback)] focus-visible:-outline-offset-4",
              value === option.value
                ? "border-accent text-accent"
                : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            <span className="block hyphens-auto">{option.label}</span>
          </button>
        ))}
      </div>
      {action && <div className="flex shrink-0 items-center pb-1">{action}</div>}
    </div>
  );
}
