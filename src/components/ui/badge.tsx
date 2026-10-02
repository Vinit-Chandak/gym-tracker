import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A small ruled label, not a pill: state is marked with a crisp hairline and the pen it
 * belongs to, so the same badge reads the same way on either sheet. `accent` is the coach's
 * pen; `highlight` is the marker, for the one thing on the screen that is current.
 */
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "highlight" | "success" | "warning" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full min-w-0 shrink-0 items-center rounded-control border px-1.5 py-0.5 text-xs font-medium [overflow-wrap:anywhere]",
        tone === "accent" && "border-pen text-pen",
        tone === "highlight" && "border-highlight-strong bg-highlight text-on-highlight",
        tone === "success" && "border-success text-success",
        tone === "warning" && "border-warning text-warning",
        tone === "danger" && "border-danger text-danger",
        tone === "neutral" && "border-line-strong text-ink-muted",
      )}
    >
      {children}
    </span>
  );
}
