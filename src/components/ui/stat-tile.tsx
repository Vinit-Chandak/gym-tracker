import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A row of small numbers under their labels. Inside a panel, four across leaves each label about
 * a quarter of the screen minus the padding, which the longest of them ("Unavailable") only
 * clears from about 440px. Below that it is two rows of two, rather than words broken
 * mid-syllable.
 */
export function StatTileRow({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <dl className={cn("grid grid-cols-2 gap-x-4 gap-y-3 min-[440px]:grid-cols-4", className)}>
      {children}
    </dl>
  );
}

export function StatTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 border-l border-line pl-3">
      <dt className="text-xs leading-tight text-ink-muted">{label}</dt>
      <dd className="mt-1 text-lg font-medium tabular-nums">{value}</dd>
    </div>
  );
}
