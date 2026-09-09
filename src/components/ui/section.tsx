import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { InfoTip } from "./info-tip";

/**
 * The default grouping: a heading, a rule and the rows beneath it. No fill, so several of
 * these on one screen read as one page rather than a stack of competing panels.
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
  /** An explanation of the section, kept behind a tip beside the title rather than under it. */
  info?: ReactNode;
  description?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("min-w-0", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line pb-2">
        <h2 className="flex items-center gap-1 text-lg font-medium">
          {title}
          {info && <InfoTip label={`About ${title.toLowerCase()}`}>{info}</InfoTip>}
        </h2>
        {action}
      </div>
      {description && <p className="mt-2 text-sm text-ink-muted">{description}</p>}
      <div className="mt-3 min-w-0 space-y-3">{children}</div>
    </section>
  );
}
