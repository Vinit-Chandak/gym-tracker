"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { SegmentOption } from "./segmented-control";

/**
 * Panels of one screen (DESIGN.md, Navigation): words on a hairline, where you are ink and
 * underlined. The tabs share the row equally and wrap rather than scroll: a scroller hides
 * destinations behind a gesture, while a tab that cannot fit its word whole takes the next
 * row, in the same order every time, so nothing is clipped and no label has to shrink.
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
    <div className="tabs flex min-w-0 items-end gap-1 border-b border-hair">
      <div role="tablist" aria-label={label} className="flex min-w-0 flex-1 flex-wrap">
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
              "tab relative grid min-h-[var(--ov-target-header)] min-w-max flex-[1_1_0] place-items-center px-1 text-[length:var(--ov-type-meta)] whitespace-nowrap focus-visible:-outline-offset-4",
              value === option.value ? "font-bold text-ink" : "font-semibold text-ink-2",
            )}
          >
            {option.label}
            {value === option.value && (
              <span
                aria-hidden
                className="tab-indicator absolute inset-x-2.5 -bottom-px h-[2.5px] rounded-indicator bg-ink"
              />
            )}
          </button>
        ))}
      </div>
      {action && <div className="flex shrink-0 items-center pb-1">{action}</div>}
    </div>
  );
}
