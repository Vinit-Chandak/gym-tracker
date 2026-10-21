import { PageHeader } from "./page-header";
import { PageContent } from "./page-content";
import { LoadingMessage } from "./navigation-feedback";

/**
 * A tab's root while it loads (DESIGN.md, Tab roots): its headline's place in Title and its
 * Meta's line, in surface, where the subject will stand. The tab's name is never shown, as the
 * root never shows it; the h1 says it for a screen reader until the subject arrives.
 */
export function RootLoadingHeader({ tab, avatar = false }: { tab: string; avatar?: boolean }) {
  return (
    <header className="page-header page-root page-width pt-safe">
      <div className="page-root-top">
        <div className="page-root-head">
          {avatar && (
            <div aria-hidden className="page-root-lead motion-safe:animate-pulse">
              <div className="person-card-avatar rounded-full bg-surface-2" />
            </div>
          )}
          <div className="page-root-text">
            <h1 className="sr-only">{tab}</h1>
            <div aria-hidden className="motion-safe:animate-pulse">
              <div className="h-[var(--ov-type-title)] w-[min(12rem,60%)] rounded-control bg-surface-2" />
              <div className="mt-[calc(6*var(--ov-u))] h-[calc(var(--ov-type-meta)*1.4)] w-[min(9rem,45%)] rounded-control bg-surface" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * The skeleton matches the geometry it is standing in for — a title, then a box of rows of
 * roughly the right height — so the real screen replaces it without the page jumping. A tab's
 * root (`tab`) stands in its root's headline rather than a title it never shows.
 */
export function LoadingPage({
  tab,
  avatar = false,
  title = "Loading",
  /** Reserves the section picker and its filters, so rows do not jump up on arrival. */
  controls = false,
  /** Reserves a two-by-two grid of shortcut tiles above the rows. */
  tiles = false,
  /** Reserves one full-width two-way control above the rows. */
  segmented = false,
  /** Reserves a box holding one text field, for a page that is a search. */
  field = false,
  rows = 5,
  what,
}: {
  /** The tab whose root is loading: "Plan". Its name is the loading message's, never shown. */
  tab?: string;
  /** The root leads with the athlete's avatar (Profile). */
  avatar?: boolean;
  title?: string;
  /** What is loading, where the title is not a thing ("Choose a day" loads "the days"). */
  what?: string;
  controls?: boolean;
  tiles?: boolean;
  segmented?: boolean;
  field?: boolean;
  rows?: number;
}) {
  return (
    <>
      {tab ? <RootLoadingHeader tab={tab} avatar={avatar} /> : <PageHeader title={title} />}
      <PageContent>
        <div role="status" aria-live="polite" className="space-y-4">
          <LoadingMessage title={tab ?? title} what={what} />
          {controls && (
            <div aria-hidden="true" className="flex gap-2 motion-safe:animate-pulse">
              <div className="h-11 flex-1 rounded-control bg-surface-raised" />
              <div className="h-11 w-24 rounded-control bg-surface-raised" />
            </div>
          )}
          {tiles && (
            <div aria-hidden="true" className="grid grid-cols-2 gap-3 motion-safe:animate-pulse">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex min-h-14 box items-center gap-2.5 px-3">
                  <div className="size-5 shrink-0 rounded-control bg-surface-raised" />
                  <div className="h-4 w-3/5 rounded-control bg-surface-raised" />
                </div>
              ))}
            </div>
          )}
          {segmented && (
            <div
              aria-hidden="true"
              className="h-11 rounded-control bg-surface-raised motion-safe:animate-pulse"
            />
          )}
          {field && (
            <div aria-hidden="true" className="box panel-padding motion-safe:animate-pulse">
              <div className="h-11 rounded-control bg-surface-raised" />
            </div>
          )}
          {rows > 0 && (
            <ul aria-hidden="true" className="box-rows motion-safe:animate-pulse">
              {Array.from({ length: rows }, (_, i) => i).map((i) => (
                <li key={i} className="flex min-h-14 items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-4 w-2/5 rounded-control bg-surface-raised" />
                    <div className="h-3 w-3/5 rounded-control bg-surface-raised" />
                  </div>
                  <div className="size-5 shrink-0 rounded-control bg-surface-raised" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </PageContent>
    </>
  );
}
