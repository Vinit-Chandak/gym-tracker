import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * A padded box: the grouping for a summary, a decision or a form section. Filled and
 * rounded with no outline in either palette, so the lift from the canvas is its only edge.
 * Rows that belong together go in a `List` instead, which is the same box without padding.
 */
export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("box space-y-3 panel-padding", className)} {...props} />;
}
