import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        tone === "accent" && "border-accent/40 bg-accent/10 text-accent",
        tone === "danger" && "border-danger/40 bg-danger/10 text-danger",
        tone === "neutral" && "border-line-strong text-ink-muted",
      )}
    >
      {children}
    </span>
  );
}
