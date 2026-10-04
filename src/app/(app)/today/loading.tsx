import { LoadingMessage } from "@/components/shell/navigation-feedback";

/**
 * Today while it loads, in Today's own geometry (DESIGN.md, Today): the head's line, the print's
 * band and two cards, so the day arrives into its places rather than replacing a page of rows
 * with a title Today does not have.
 */
export default function Loading() {
  return (
    <>
      <h1 className="sr-only">Today</h1>
      <div className="today page-width">
        <div role="status" aria-live="polite">
          <header className="today-head">
            <LoadingMessage title="Today" />
          </header>
          <div aria-hidden="true" className="motion-safe:animate-pulse">
            <div className="today-print rounded-[2px] bg-surface" />
            <ul className="today-cards">
              {[0, 1].map((card) => (
                <li key={card} className="activity-card">
                  <div className="flex min-h-[var(--ov-target)] items-center gap-2.5 py-1">
                    <div className="size-[22px] shrink-0 rounded-[4px] bg-surface-2" />
                    <div className="h-6 w-2/5 rounded-control bg-surface-2" />
                  </div>
                  <div className="mt-1 ml-8 h-4 w-3/5 rounded-control bg-surface" />
                  <div className="mt-3.5 h-[var(--ov-button-short)] rounded-control bg-surface" />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
