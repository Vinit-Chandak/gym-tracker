import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * A block on the sheet: ruled above and below, open at the sides, its text flush with the
 * rules. The grouping for a summary, a decision or a form section. Rows that belong
 * together go in a `List` instead, which is the same block cut into rows.
 */
export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("box space-y-3 py-4", className)} {...props} />;
}
