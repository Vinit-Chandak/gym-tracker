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
 * The title owns the line and its meta sits at the far end of the same baseline in the data
 * voice, so the eye reads one row. It stays at the top of the screen while the sheet scrolls
 * beneath it, on an opaque strip ruled off from the page.
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
        <div className="page-width flex min-h-[var(--header-height)] flex-wrap items-center gap-3 py-2">
          <div className="flex min-w-0 flex-[1_1_12rem] flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h1 className="max-w-full shrink-0 text-xl [overflow-wrap:anywhere]">{title}</h1>
            {meta && (
              <p className="min-w-0 font-data text-sm font-medium [overflow-wrap:anywhere] text-ink-muted tabular-nums">
                {meta}
              </p>
            )}
          </div>
          {action && <div className="max-w-full">{action}</div>}
        </div>
      )}
    </header>
  );
}

/**
 * One level down: a compact bar with the way back named beside its chevron, in the pen's
 * blue, because it can be tapped. The title sits between two flexible cells, so it is centred
 * whatever is beside it and you can tell at a glance that this screen is inside another.
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
    <div className="page-width flex min-h-[var(--header-height)] flex-wrap items-center gap-2 py-1">
      <BackLink fallback={backHref} label={backLabel} />
      <h1 className="max-w-full shrink-0 text-lg font-semibold [overflow-wrap:anywhere]">
        {title}
      </h1>
      <div className="flex min-w-0 flex-1 basis-[5.5rem] items-center justify-end gap-2">
        {meta && (
          <p className="min-w-0 font-data text-sm font-medium [overflow-wrap:anywhere] text-ink-muted">
            {meta}
          </p>
        )}
        {action}
      </div>
    </div>
  );
}
