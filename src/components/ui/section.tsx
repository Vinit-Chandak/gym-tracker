import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { InfoTip } from "./info-tip";

/**
 * A column heading on the sheet: small, spaced capitals, sitting on the block beneath it.
 * Quiet on purpose, so several on one screen read as one page rather than a stack of
 * headings; the block's own rule is the line under it.
 */
export function Section({
  title,
  action,
  info,
  description,
  className,
  children,
}: {
  title: string;
  action?: ReactNode;
  /** An explanation of the section, kept behind a tip beside the label rather than under it. */
  info?: ReactNode;
  description?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("min-w-0", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pb-2">
        <h2 className="flex items-center gap-1 text-xs font-semibold tracking-[0.08em] text-ink-muted uppercase">
          {title}
          {info && <InfoTip label={`About ${title.toLowerCase()}`}>{info}</InfoTip>}
        </h2>
        {action}
      </div>
      {description && <p className="pb-2 text-sm text-ink-muted">{description}</p>}
      <div className="min-w-0 space-y-3">{children}</div>
    </section>
  );
}
