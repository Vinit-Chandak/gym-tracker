import type { ReactNode } from "react";

import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";

/**
 * A row of small numbers under their labels. Four across needs a row about 27rem wide for the
 * longest label ("Unavailable"); narrower than that it is two rows of two, rather than words
 * broken mid-syllable. The row measures itself in rem, so larger text keeps two across. The gap
 * does the separating; there are no rules between tiles. Pass `@min-[27rem]:grid-cols-3` (with
 * `grid-cols-3`) for a row of three.
 */
export function StatTileRow({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className="@container min-w-0">
      <dl className={cn("grid grid-cols-2 gap-x-4 gap-y-3 @min-[27rem]:grid-cols-4", className)}>
        {children}
      </dl>
    </div>
  );
}

export function StatTile({
  label,
  value,
  info,
}: {
  label: string;
  value: ReactNode;
  /** What the number means, when the label alone does not say — e.g. what RIR is here. */
  info?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-0.5 text-xs leading-tight font-semibold text-ink-muted">
        {label}
        {info && (
          <InfoTip label={`About ${label}`} className="-my-2">
            {info}
          </InfoTip>
        )}
      </dt>
      <dd className="mt-1 font-display text-display-s font-extrabold tabular-nums">{value}</dd>
    </div>
  );
}
