import type { Route } from "next";
import type { ReactNode } from "react";

import { FitTitle } from "@/components/ui/fit-title";

import { BackLink } from "./back-link";

type PageHeaderProps<T extends string> = {
  /** The screen's name. */
  title: ReactNode;
  /** The one fact that qualifies it: the range Progress is drawn over, the gym a form is for. */
  meta?: ReactNode;
  /**
   * The fact is said with the title rather than shown under it, where the screen already shows
   * it (a meal of today's: board Dinner).
   */
  metaHidden?: boolean;
  /** Fallback for a direct link; otherwise Back returns to the previous browser entry. */
  backHref?: Route<T>;
  /** What to call that destination, when the section it sits in is vaguer than the page. */
  backLabel?: string;
  /** At most one control: beside a destination's title, or at the end of a nested screen's bar. */
  action?: ReactNode;
};

/**
 * Every screen's opening (DESIGN.md, Navigation), in two shapes, scrolling with the page:
 *
 * - a destination (Training, Profile) has its title, Jost 36 (32 under 360 pt), and at most
 *   one action beside it;
 * - a nested screen has a back link that names where it goes, then its name as the screen's
 *   display title, stepping down for a long name, and its one fact under it.
 */
export function PageHeader<T extends string>({
  title,
  meta,
  metaHidden = false,
  backHref,
  backLabel,
  action,
}: PageHeaderProps<T>) {
  if (!backHref)
    return (
      <header className="page-header page-width pt-safe">
        <div className="page-header-top">
          <div className="min-w-0">
            <h1 className="type-title [overflow-wrap:anywhere]">{title}</h1>
            {meta && (
              <p className="mt-1 type-meta-small [overflow-wrap:anywhere] text-ink-2 tabular-nums">
                {meta}
              </p>
            )}
          </div>
          {action && <div className="page-header-action">{action}</div>}
        </div>
      </header>
    );

  return (
    <header className="page-header page-width pt-safe">
      <div className="page-header-bar">
        <BackLink fallback={backHref} label={backLabel} />
        {action && <div className="page-header-action">{action}</div>}
      </div>
      {typeof title === "string" ? (
        <FitTitle
          as="h1"
          sizes={{ base: 34, narrow: 30 }}
          className="mt-0.5"
          said={metaHidden && typeof meta === "string" ? meta : undefined}
        >
          {title}
        </FitTitle>
      ) : (
        <h1 className="mt-0.5 type-display [overflow-wrap:anywhere]">{title}</h1>
      )}
      {meta && !metaHidden && (
        // Words are one fact; facts given as elements are laid out by the line.
        <p className="meta-line mt-1 [overflow-wrap:anywhere]">
          {typeof meta === "string" ? <span className="min-w-0">{meta}</span> : meta}
        </p>
      )}
    </header>
  );
}
