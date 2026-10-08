"use client";

import { cn } from "@/lib/utils";

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
  return (
    <nav aria-label={label} className={className}>
      <ul className="flex min-w-0 gap-[2px] rounded-control bg-surface p-[3px]">
        {pageSlots(page, total).map((slot, index) =>
          slot === "gap" ? (
            <li
              key={`gap-${index}`}
              aria-hidden
              className="flex w-5 shrink-0 items-center justify-center font-bold text-ink-2"
            >
              …
            </li>
          ) : (
            <li key={slot} className="min-w-0 flex-1">
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
          ),
        )}
      </ul>
    </nav>
  );
}
