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
 * A top-level screen opens with its name large, in the display face, and the qualifying
 * fact small above it (the date on Today, the range on Progress), the way a scoreboard
 * leads with the score. The name scrolls away with the page; there is no rule to draw.
 */
export function PageHeader<T extends string>({
  title,
  meta,
  backHref,
  backLabel,
  action,
}: PageHeaderProps<T>) {
  return (
    <header
      className={
        backHref
          ? "page-header sticky top-0 z-30 bg-canvas/85 pt-safe backdrop-blur-xl"
          : "page-header pt-safe"
      }
    >
      {backHref ? (
        <NestedBar
          title={title}
          meta={meta}
          backHref={backHref}
          backLabel={backLabel}
          action={action}
        />
      ) : (
        <div className="page-width flex flex-wrap items-end gap-3 pt-6 pb-4">
          {/* The meta follows the name in reading order and sits above it on screen. */}
          {/* Sized by its words, so an action that does not fit beside the name wraps under
              it rather than the name breaking inside a word. */}
          <div className="flex min-w-0 flex-[1_1_auto] flex-col-reverse gap-1">
            <h1 className="min-w-0 text-display-m break-words">{title}</h1>
            {meta && (
              <p className="min-w-0 text-sm font-semibold [overflow-wrap:anywhere] text-ink-muted tabular-nums">
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
 * One level down: a compact bar with the way back named beside its chevron, then the
 * screen's name with its qualifying fact under it (the gym a workout is at, the date a
 * record is from), and any action at the end.
 *
 * Naming the destination is what a lone chevron could only hint at, and it gives the
 * control a label worth 44px of its own.
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
    <div className="page-width flex min-h-14 flex-wrap items-center gap-x-2 gap-y-1 py-1.5">
      <BackLink fallback={backHref} label={backLabel} />
      <div className="min-w-0 flex-1 basis-32">
        <h1 className="font-sans text-headline leading-tight font-semibold [overflow-wrap:anywhere]">
          {title}
        </h1>
        {meta && (
          <p className="text-[0.8125rem] leading-snug [overflow-wrap:anywhere] text-ink-muted">
            {meta}
          </p>
        )}
      </div>
      {action && <div className="flex max-w-full items-center gap-2">{action}</div>}
    </div>
  );
}
