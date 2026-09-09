"use client";

import { ChevronDown } from "lucide-react";
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
      className={cn("group min-w-0 border-y border-line", className)}
    >
      <summary className="flex min-h-11 list-none items-center gap-2 py-2 text-sm font-medium">
        <ChevronDown
          className="size-4 shrink-0 text-ink-subtle transition-transform duration-[var(--ov-duration-feedback)] group-open:rotate-180"
          aria-hidden
        />
        <span className="min-w-0 flex-1">{summary}</span>
        {meta && <span className="shrink-0 text-xs text-ink-muted tabular-nums">{meta}</span>}
      </summary>
      <div className="pt-1 pb-3">{children}</div>
    </details>
  );
}
