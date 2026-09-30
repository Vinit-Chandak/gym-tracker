import type { ReactNode } from "react";

import { Plus } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/**
 * A food row's words: its name, and the one line about it under the name (a portion, what a
 * saved meal holds). Every food row on the food screens reads the same way, so a food looks
 * alike wherever it is listed.
 *
 * The space between the two is for the row's accessible name, which a screen reader reads as
 * one string; between block-level spans it takes no room on the screen.
 */
export function RowText({
  title,
  meta,
  className,
}: {
  title: string;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("min-w-0 flex-1", className)}>
      <span className="block font-semibold [overflow-wrap:anywhere]">{title}</span>
      {meta && (
        <>
          {" "}
          <span className="block text-sm [overflow-wrap:anywhere] text-ink-muted tabular-nums">
            {meta}
          </span>
        </>
      )}
    </span>
  );
}

/**
 * The trailing mark of a row that puts a food into a meal: food's own plus on its soft wash.
 * Decorative, since the row it ends is already the button that adds.
 */
export function AddMark() {
  return (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-food-soft text-food-ink"
    >
      <Plus />
    </span>
  );
}
