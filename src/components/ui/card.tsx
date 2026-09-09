import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Card({
  className,
  variant = "surface",
  ...props
}: ComponentProps<"section"> & { variant?: "surface" | "plain" }) {
  return (
    <section
      className={cn(
        "min-w-0 space-y-3",
        variant === "surface"
          ? "rounded-card bg-surface panel-padding ring-1 ring-line/50 ring-inset"
          : "border-t border-line/70 py-[var(--section-gap)]",
        className,
      )}
      {...props}
    />
  );
}
