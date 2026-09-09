import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A row of small numbers under their labels. Inside a card, four across leaves each label about
 * a quarter of the screen minus the padding, which the longest of them ("Unavailable") only
 * clears from about 440px. Below that it is two rows of two, rather than words broken
 * mid-syllable.
 */
export function StatTileRow({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <dl className={cn("grid grid-cols-2 gap-2 min-[440px]:grid-cols-4", className)}>{children}</dl>
  );
}

export function StatTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-control bg-surface-raised px-2 py-2 text-center">
      <dt className="text-xs leading-tight text-ink-subtle">{label}</dt>
      <dd className="text-base font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
