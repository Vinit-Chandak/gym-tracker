"use client";

import { ChevronDown } from "@/components/ui/icons";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { boldEmWidth } from "./fit";

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
   * `box` is its own box on the page; `inline` is a ruled row inside a box that is
   * already there; `footer` is the last row of a padded box, taking the box's full width
   * and its bottom edge, so a closed section adds one hairline and nothing else.
   */
  variant?: "box" | "inline" | "footer";
  className?: string;
  children: ReactNode;
};

/**
 * Progressive disclosure on a native <details>: it takes only its summary row when closed,
 * so a collapsed section never reserves a tall blank panel for content nobody asked for. The
 * summary starts at the row's edge with the names around it and the chevron ends the row, as
 * Today's cards end theirs (DESIGN.md, Folds).
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
  const details = useRef<HTMLDetailsElement>(null);
  // A required field folded away that fails the browser's own check opens its fold, so the
  // browser can point at it: Save never does nothing in silence. `invalid` does not bubble, so
  // it is heard on its way down.
  useEffect(() => {
    const element = details.current;
    if (!element) return;
    const reveal = () => setOpen(true);
    element.addEventListener("invalid", reveal, true);
    return () => element.removeEventListener("invalid", reveal, true);
  }, []);
  // Adjusting state during render, rather than in an effect: the section must already be
  // open on the render that first reports the error, not one paint later.
  const [wasRequested, setWasRequested] = useState(defaultOpen);
  if (defaultOpen !== wasRequested) {
    setWasRequested(defaultOpen);
    if (defaultOpen) setOpen(true);
  }

  return (
    <details
      ref={details}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className={cn(
        "min-w-0",
        variant === "box" && "box",
        variant === "inline" && "border-y border-line",
        // Full bleed inside a padded box: one rule above it and the box's bottom edge below.
        variant === "footer" &&
          "-mx-[var(--panel-padding)] -mb-[var(--panel-padding)] border-t border-line",
        className,
      )}
    >
      <summary
        className={cn(
          "relative flex list-none flex-wrap items-center gap-2 font-medium",
          variant === "box" &&
            "min-h-14 rounded-card py-3 pr-[calc(1rem+var(--ov-icon-control)+var(--spacing)*2)] pl-4",
          variant === "inline" &&
            "min-h-[var(--ov-target)] py-2 pr-[calc(var(--ov-icon-control)+var(--spacing)*2)] text-sm",
          variant === "footer" &&
            "min-h-12 rounded-b-card py-3 pr-[calc(var(--panel-padding)+var(--ov-icon-control)+var(--spacing)*2)] pl-[var(--panel-padding)] text-sm transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised [details[open]>&]:rounded-b-none",
        )}
      >
        {/* The summary wraps between its words to keep the count on its line, and lets the
            count go under it only when the summary would have less than its own width or a few
            words' room, whichever is less (large text): "The plan" keeps "5 exercises · 17 sets"
            beside it at 320 pt. Under it, the count has the row's whole width; the chevron keeps
            the row's end, in the room the row leaves for it. */}
        <span
          className="min-w-0 shrink grow [overflow-wrap:break-word]"
          style={{
            flexBasis: `min(8rem, ${(boldEmWidth(summary) * 1.01).toFixed(3)}em, 100%)`,
          }}
        >
          {summary}
        </span>
        {meta && (
          <span className="ml-auto max-w-full text-xs [overflow-wrap:break-word] text-ink-muted tabular-nums">
            {/* Read after a pause, not run into the summary's last word. */}
            <span className="sr-only">, </span>
            {meta}
          </span>
        )}
        {/* Turned by its own fold alone: a fold inside an open fold keeps its own state. */}
        <ChevronDown
          className={cn(
            "absolute top-1/2 -translate-y-1/2 text-ink-subtle transition-[rotate] duration-[var(--ov-duration-feedback)] [details[open]>summary>&]:rotate-180",
            variant === "box" && "right-4",
            variant === "inline" && "right-0",
            variant === "footer" && "right-[var(--panel-padding)]",
          )}
          aria-hidden
        />
      </summary>
      <div
        className={cn(
          variant === "box" && "border-t border-line px-4 pt-3 pb-4",
          variant === "inline" && "pt-1 pb-3",
          variant === "footer" && "px-[var(--panel-padding)] pt-1 pb-4",
        )}
      >
        {children}
      </div>
    </details>
  );
}
