import type { Route } from "next";
import { BackLink } from "./back-link";
import type { ReactNode } from "react";

type PageHeaderProps<T extends string> = {
  /** The screen's name. Today gives the app's own, as a `<Wordmark />`. */
  title: ReactNode;
  /** The date Today is, the range History and Progress are drawn over, the gym a form is for. */
  meta?: string;
  /** Fallback for a direct link; otherwise Back returns to the previous browser entry. */
  backHref?: Route<T>;
  /** What to call that destination, when the section it sits in is vaguer than the page. */
  backLabel?: string;
  /** Optional trailing control, e.g. an "Add" button. */
  action?: ReactNode;
};

/**
 * Every screen's opening line: what this is, and the one fact that qualifies it.
 *
 * A masthead rather than a stack. The title owns the line and its meta hangs off the far
 * end of the same baseline, so the eye reads one row instead of dropping through a small
 * uppercase line to get to the name. The rule underneath separates the header from content
 * scrolling beneath it, which a colour alone cannot do while both are canvas.
 */
export function PageHeader<T extends string>({
  title,
  meta,
  backHref,
  backLabel,
  action,
}: PageHeaderProps<T>) {
  return (
    <header className="page-header sticky top-0 z-30 border-b border-line bg-canvas pt-safe">
      {backHref ? (
        <NestedBar
          title={title}
          meta={meta}
          backHref={backHref}
          backLabel={backLabel}
          action={action}
        />
      ) : (
        <div className="page-width flex min-h-[var(--header-height)] items-center gap-3 py-2.5">
          <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
            <h1 className="min-w-0 text-xl [overflow-wrap:anywhere]">{title}</h1>
            {meta && <p className="shrink-0 text-sm text-ink-muted tabular-nums">{meta}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
    </header>
  );
}

/**
 * One level down: a compact bar with the way back named beside its chevron.
 *
 * The title sits between two flexible cells, so it is centred whatever is beside it and you
 * can tell at a glance that this screen is inside another. Naming the destination is what a
 * lone chevron could only hint at, and it gives the control a label worth 44px of its own.
 */
function NestedBar<T extends string>({
  title,
  meta,
  backHref,
  backLabel,
  action,
}: {
  title: ReactNode;
  meta?: string;
  backHref: Route<T>;
  backLabel?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-width flex min-h-[3.25rem] flex-wrap items-center gap-2 py-1">
      <BackLink fallback={backHref} label={backLabel} />
      <h1 className="min-w-0 text-lg [overflow-wrap:anywhere]">{title}</h1>
      <div className="flex min-w-0 flex-1 basis-[5.5rem] items-center justify-end gap-2">
        {meta && <p className="text-sm text-ink-muted">{meta}</p>}
        {action}
      </div>
    </div>
  );
}
