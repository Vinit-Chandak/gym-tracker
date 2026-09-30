import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { InfoTip } from "./info-tip";

/**
 * A heading above a card, in sentence case. The card beneath carries the group, so the
 * heading only names it: no rule, no eyebrow, nothing drawn under it.
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
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 pb-2">
        <h2 className="flex min-w-0 flex-wrap items-center gap-1 text-headline font-semibold text-ink">
          {title}
          {info && <InfoTip label={`About ${title.toLowerCase()}`}>{info}</InfoTip>}
        </h2>
        {action}
      </div>
      {description && <p className="-mt-1 px-1 pb-2 text-sm text-ink-muted">{description}</p>}
      <div className="min-w-0 space-y-3">{children}</div>
    </section>
  );
}
