import { PageHeader } from "./page-header";
import { PageContent } from "./page-content";
import { LoadingMessage } from "./navigation-feedback";

/**
 * The skeleton matches the geometry it is standing in for — a title, then a box of rows of
 * roughly the right height — so the real screen replaces it without the page jumping.
 */
export function LoadingPage({
  title = "Loading",
  /** Reserves the tab strip, so the destination's rows do not jump up when it arrives. */
  tabs = 0,
}: {
  title?: string;
  tabs?: number;
}) {
  return (
    <>
      <PageHeader title={title} />
      <PageContent>
        <div role="status" aria-live="polite" className="space-y-4">
          <LoadingMessage title={title} />
          {tabs > 0 && (
            <div
              aria-hidden="true"
              className="grid gap-1 border-b border-line pb-2 motion-safe:animate-pulse"
              style={{ gridTemplateColumns: `repeat(auto-fit, minmax(4.75rem, 1fr))` }}
            >
              {Array.from({ length: tabs }, (_, i) => (
                <div key={i} className="h-9 rounded-control bg-surface-raised" />
              ))}
            </div>
          )}
          <ul aria-hidden="true" className="box-rows motion-safe:animate-pulse">
            {[0, 1, 2, 3, 4].map((i) => (
              <li key={i} className="flex min-h-14 items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-2/5 rounded-control bg-surface-raised" />
                  <div className="h-3 w-3/5 rounded-control bg-surface-raised" />
                </div>
                <div className="size-5 shrink-0 rounded-control bg-surface-raised" />
              </li>
            ))}
          </ul>
        </div>
      </PageContent>
    </>
  );
}
