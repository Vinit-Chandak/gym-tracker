import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function SectionHeading({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-medium">{title}</h2>
      {action}
    </div>
  );
}

/**
 * The default grouping: a heading, a rule and the rows beneath it. No fill, so several of
 * these on one screen read as one page rather than a stack of competing panels.
 */
export function Section({
  title,
  action,
  description,
  className,
  children,
}: {
  title: string;
  action?: ReactNode;
  description?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("min-w-0", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line pb-2">
        <h2 className="text-lg font-medium">{title}</h2>
        {action}
      </div>
      {description && <p className="mt-2 text-sm text-ink-muted">{description}</p>}
      <div className="mt-3 min-w-0 space-y-3">{children}</div>
    </section>
  );
}
