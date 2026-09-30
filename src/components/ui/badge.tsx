import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A small filled pill: a soft wash of the state's colour with its ink on top, so the same
 * badge reads the same way on either canvas without drawing another outline.
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
        "badge inline-flex max-w-full min-w-0 shrink-0 items-center rounded-chip px-2.5 py-1 text-xs leading-none font-semibold [overflow-wrap:anywhere]",
        tone === "accent" && "bg-accent-soft text-accent",
        tone === "success" && "bg-success/12 text-success",
        tone === "warning" && "bg-warning/14 text-warning",
        tone === "danger" && "bg-danger/12 text-danger",
        tone === "neutral" && "bg-surface-raised text-ink-muted",
      )}
    >
      {children}
    </span>
  );
}
