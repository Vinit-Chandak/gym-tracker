"use client";

import { ChevronDown } from "@/components/ui/icons";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type DisclosureProps = {
  summary: string;
  /** Trailing text on the summary row, so the state is readable without opening it. */
  meta?: string;
  /**
   * Opens the section. Raising this from false reopens it — which is how a form points at
   * an invalid field it had folded away — but the reader can still close it again.
   */
  defaultOpen?: boolean;
  /**
   * `box` is its own ruled block on the page; `inline` is a ruled row inside a block that is
   * already there; `footer` is the last row of a block, taking its full width and its bottom
   * rule, so a closed section adds one hairline and nothing else.
   */
  variant?: "box" | "inline" | "footer";
  className?: string;
  children: ReactNode;
};

/**
 * Progressive disclosure on a native <details>: it takes only its summary row when closed,
 * so a collapsed section never reserves a tall blank panel for content nobody asked for.
 */
export function Disclosure({
  summary,
  meta,
  defaultOpen = false,
  variant = "box",
  className,
  children,
}: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  // Adjusting state during render, rather than in an effect: the section must already be
  // open on the render that first reports the error, not one paint later.
  const [wasRequested, setWasRequested] = useState(defaultOpen);
  if (defaultOpen !== wasRequested) {
    setWasRequested(defaultOpen);
    if (defaultOpen) setOpen(true);
  }

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className={cn(
        "group min-w-0",
        variant === "box" && "box",
        variant === "inline" && "border-y border-line",
        // Full bleed inside a block: one rule above it and the block's bottom edge below.
        variant === "footer" && "-mb-4 border-t border-line",
        className,
      )}
    >
      <summary
        className={cn(
          "flex list-none flex-wrap items-center gap-2 font-medium transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised",
          variant === "box" && "min-h-14 py-3",
          variant === "inline" && "min-h-11 py-2 text-sm",
          variant === "footer" && "min-h-12 py-3 text-sm",
        )}
      >
        <ChevronDown
          className="shrink-0 text-ink-subtle transition-transform duration-[var(--ov-duration-feedback)] ease-[var(--ov-ease-out)] group-open:rotate-180"
          aria-hidden
        />
        <span className="min-w-0 flex-auto [overflow-wrap:anywhere]">{summary}</span>
        {meta && (
          <span className="ml-auto max-w-full text-sm [overflow-wrap:anywhere] text-ink-muted tabular-nums">
            {meta}
          </span>
        )}
      </summary>
      <div
        className={cn(
          variant === "box" && "pt-1 pb-4",
          variant === "inline" && "pt-1 pb-3",
          variant === "footer" && "pt-1 pb-4",
        )}
      >
        {children}
      </div>
    </details>
  );
}
