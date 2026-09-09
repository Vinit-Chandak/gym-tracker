import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * A filled panel. Reserved for a distinct decision, a summary or a form section — ordinary
 * rows are grouped with a rule and alignment instead, which is what `Section` and `List`
 * are for. Putting a panel around every label and value is the thing this design removes.
 */
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
          ? "rounded-card border border-line bg-surface panel-padding"
          : "border-t border-line pt-[var(--ov-space-5)]",
        className,
      )}
      {...props}
    />
  );
}
