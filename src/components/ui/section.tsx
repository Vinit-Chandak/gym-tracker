import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { aboutLabel } from "./about-label";
import { InfoTip } from "./info-tip";

/**
 * A section's name above its box or list, as every section's name is set (DESIGN.md,
 * Typography: Section), at the gutter with the box's edge and the names under it (The One Left
 * Edge Rule). Its row carries the heading's gaps (The Rhythm Rule), so a form's sections stand
 * apart as sections and nothing is drawn under the name.
 */
export function Section({
  title,
  action,
  info,
  className,
  children,
}: {
  title: string;
  action?: ReactNode;
  /** An explanation of the section, kept behind a tip beside the label rather than under it. */
  info?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("min-w-0", className)}>
      <div className="heading-row">
        {/* The ⓘ stands beside the heading, never in it, so the heading reads as its name. */}
        <div className="flex items-center gap-1">
          <h2 className="caption-head">{title}</h2>
          {info && <InfoTip label={aboutLabel(title)}>{info}</InfoTip>}
        </div>
        {action}
      </div>
      <div className="min-w-0 space-y-3">{children}</div>
    </section>
  );
}
