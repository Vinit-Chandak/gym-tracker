import type { ReactNode } from "react";

import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";

/**
 * A row of measures under their labels, the way a sheet tabulates them. Four across from
 * about 440px; two rows of two below that, rather than words broken mid-syllable. The gap
 * does the separating; there are no rules between tiles.
 */
export function StatTileRow({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <dl className={cn("grid grid-cols-2 gap-x-4 gap-y-4 min-[440px]:grid-cols-4", className)}>
      {children}
    </dl>
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
      <dt className="flex items-center gap-0.5 text-xs leading-tight text-ink-muted">
        {label}
        {info && (
          <InfoTip label={`About ${label}`} className="-my-2">
            {info}
          </InfoTip>
        )}
      </dt>
      <dd className="mt-1.5 measure text-xl">{value}</dd>
    </div>
  );
}
