"use client";

import { Fragment } from "react";

import { cn } from "@/lib/utils";

import { boldEmWidth } from "./fit";
import { foldStyles } from "./fold";

/** A slot in the page tabs: a page's number, or a gap of pages not shown. */
export type PageSlot = number | "gap";

/**
 * Which pages the tabs show (ADR 0044): every page while there are five or fewer; past that the
 * first and the last, and the one being read with its neighbours, so the next and the previous
 * are always one tap away. Gaps mark the pages between. At most five tabs, so they keep a
 * 44-pt target at 320 pt.
 */
export function pageSlots(current: number, total: number): PageSlot[] {
  if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1);
  const page = Math.min(Math.max(current, 1), total);
  const start = page <= 3 ? 2 : page >= total - 2 ? total - 3 : page - 1;
  const middle = [start, start + 1, start + 2];
  return [
    1,
    ...(start > 2 ? (["gap"] as const) : []),
    ...middle,
    ...(start + 2 < total - 1 ? (["gap"] as const) : []),
    total,
  ];
}

/**
 * A list's pages as tabs (History, ADR 0044), drawn as the span tray is: a surface tray, each
 * page a 44-pt target, the page being read in ink. A navigation, not a choice: each tab is a
 * button, and the page being read says so aloud.
 *
 * A tab never shrinks under its target, which grows with the reader's text. When the tabs cannot
 * all share a row, at 150% text and more on a narrow phone, the tray folds onto even rows (Fold,
 * Never Drop; fold.ts) rather than laying one tab over the next or leaving the last page alone
 * under the rest: "1 2 3 / 4 … 28". A gap is only as wide as its ellipsis.
 */
export function PageTabs({
  page,
  total,
  onChange,
  label,
  className,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
  /** What the pages are of, aloud: "History pages". */
  label: string;
  className?: string;
}) {
  if (total <= 1) return null;
  const slots = pageSlots(page, total);
  const fold = foldStyles(
    slots.map((slot) =>
      slot === "gap"
        ? `calc(${boldEmWidth("…").toFixed(3)}em + 2px)`
        : `max(var(--ov-target), ${boldEmWidth(String(slot)).toFixed(3)}em + 0.75rem)`,
    ),
  );
  return (
    <nav aria-label={label} className={className}>
      <ul
        className="flex min-w-0 flex-wrap gap-[2px] rounded-control bg-surface p-[3px] text-[length:var(--ov-type-meta)]"
        style={fold.tray}
      >
        {slots.map((slot, index) => (
          <Fragment key={slot === "gap" ? `gap-${index}` : slot}>
            {index > 0 && <li aria-hidden className="fold-break" style={fold.breaks[index - 1]} />}
            {slot === "gap" ? (
              <li
                aria-hidden
                className="flex shrink-0 items-center justify-center px-px text-[length:var(--ov-type-meta)] font-bold text-ink-2"
              >
                …
              </li>
            ) : (
              <li className="flex-[1_0_var(--ov-target)]">
                <button
                  type="button"
                  aria-current={slot === page ? "page" : undefined}
                  aria-label={`Page ${slot} of ${total}`}
                  onClick={() => slot !== page && onChange(slot)}
                  className={cn(
                    "flex min-h-[var(--ov-target)] w-full min-w-[var(--ov-target)] items-center justify-center rounded-[11px] px-1.5 py-1 text-[length:var(--ov-type-meta)] leading-tight font-bold text-ink tabular-nums transition-colors duration-[var(--ov-duration-feedback)] select-none",
                    "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink",
                    slot === page && "bg-ink text-on-ink",
                  )}
                >
                  {slot}
                </button>
              </li>
            )}
          </Fragment>
        ))}
      </ul>
    </nav>
  );
}
