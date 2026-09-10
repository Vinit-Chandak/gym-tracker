import { PageHeader } from "./page-header";
import { PageContent } from "./page-content";
import { LoadingMessage } from "./navigation-feedback";

/**
 * The skeleton matches the geometry it is standing in for — a title, then a box of rows of
 * roughly the right height — so the real screen replaces it without the page jumping.
 */
export function LoadingPage({
  title = "Loading",
  /** Reserves the section picker and its filters, so rows do not jump up on arrival. */
  controls = false,
}: {
  title?: string;
  controls?: boolean;
}) {
  return (
    <>
      <PageHeader title={title} />
      <PageContent>
        <div role="status" aria-live="polite" className="space-y-4">
          <LoadingMessage title={title} />
          {controls && (
            <div aria-hidden="true" className="flex gap-2 motion-safe:animate-pulse">
              <div className="h-11 flex-1 rounded-control bg-surface-raised" />
              <div className="h-11 w-24 rounded-control bg-surface-raised" />
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
