import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { InfoTip } from "./info-tip";

/**
 * A small label above a box. Quiet on purpose: the box beneath carries the group, so
 * several of these on one screen read as one page rather than a stack of headings, and
 * nothing is drawn under the label.
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
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 pb-1.5">
        <h2 className="flex items-center gap-1 text-xs font-medium tracking-wide text-ink-muted uppercase">
          {title}
          {info && <InfoTip label={`About ${title.toLowerCase()}`}>{info}</InfoTip>}
        </h2>
        {action}
      </div>
      {description && <p className="px-1 pb-2 text-sm text-ink-muted">{description}</p>}
      <div className="min-w-0 space-y-3">{children}</div>
    </section>
  );
}
