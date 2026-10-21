import type { ReactNode } from "react";

import { Figures } from "@/components/ui/figures";
import { aboutLabel } from "@/components/ui/about-label";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";

/**
 * A row of small numbers under their labels. Each label needs about 5rem, the longest of them
 * ("Unavailable") at its size, so four across need a row 23rem wide (a 440-pt screen at 100%
 * text); three tiles stand three across there. Below that it is two rows of two, rather than
 * words broken mid-syllable, and one under the other where even two would break them. The
 * widths are the row's own, in rem, so the columns follow the reader's text size as well as the
 * screen. The gap does the separating; there are no rules between tiles.
 */
export function StatTileRow({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className="@container">
      <dl
        className={cn(
          "grid grid-cols-1 gap-x-4 gap-y-3 @min-[11rem]:grid-cols-2 @min-[23rem]:grid-cols-4",
          // Three tiles are one row of three, not three quarters of a row of four.
          "@min-[23rem]:[&:has(>:nth-child(3):last-child)]:grid-cols-3",
          className,
        )}
      >
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
      <dt className="flex items-center gap-0.5 text-xs leading-tight text-ink-muted">
        {/* A label longer than any the row was sized for wraps rather than running on. */}
        <span className="min-w-0 [overflow-wrap:break-word]">{label}</span>
        {info && (
          <InfoTip label={aboutLabel(label)} className="-my-2">
            {info}
          </InfoTip>
        )}
      </dt>
      {/* A stat is a figure (DESIGN.md, The Two Voices Rule): its digits in Jost, whose zero is
          plain, and any word with it ("Machine", "kg") in Atkinson. */}
      <dd className="mt-1 text-lg font-medium tabular-nums">
        {typeof value === "string" || typeof value === "number" ? (
          <Figures>{String(value)}</Figures>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
