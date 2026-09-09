import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A small ruled label, not a pill: Form marks state with a crisp outline and the semantic
 * ink colour, so the same badge reads the same way on either canvas.
 */
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-control border px-1.5 py-0.5 text-xs font-medium",
        tone === "accent" && "border-accent text-accent",
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
