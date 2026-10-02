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
  /** Reserves a two-by-two grid of shortcut tiles above the rows. */
  tiles = false,
  /** Reserves one full-width two-way control above the rows. */
  segmented = false,
  /** Reserves a box holding one text field, for a page that is a search. */
  field = false,
  rows = 5,
}: {
  title?: string;
  controls?: boolean;
  tiles?: boolean;
  segmented?: boolean;
  field?: boolean;
  rows?: number;
}) {
  return (
    <>
      <PageHeader title={title} />
      <PageContent>
        <div role="status" aria-live="polite" className="space-y-4">
          <LoadingMessage title={title} />
          {controls && (
            <div aria-hidden="true" className="flex gap-2">
              <div className="skeleton h-11 flex-1" />
              <div className="skeleton h-11 w-24" />
            </div>
          )}
          {tiles && (
            <div aria-hidden="true" className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex min-h-14 panel items-center gap-2.5 px-3">
                  <div className="skeleton size-5 shrink-0" />
                  <div className="skeleton h-4 w-3/5" />
                </div>
              ))}
            </div>
          )}
          {segmented && <div aria-hidden="true" className="skeleton h-11" />}
          {field && (
            <div aria-hidden="true" className="box py-4">
              <div className="skeleton h-11" />
            </div>
          )}
          {rows > 0 && (
            <ul aria-hidden="true" className="box-rows">
              {Array.from({ length: rows }, (_, i) => i).map((i) => (
                <li key={i} className="flex min-h-14 items-center gap-3 py-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="skeleton h-4 w-2/5" />
                    <div className="skeleton h-3 w-3/5" />
                  </div>
                  <div className="skeleton size-5 shrink-0" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </PageContent>
    </>
  );
}
