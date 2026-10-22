import { RootLoadingHeader } from "@/components/shell/loading-page";
import { LoadingMessage } from "@/components/shell/navigation-feedback";

/**
 * Today while it loads, in Today's own geometry (DESIGN.md, Today): the headline's place, the
 * day, as every tab root's is (Tab roots), then two cards, so the day arrives into its places
 * rather than replacing a page of rows with a title Today does not have.
 */
export default function Loading() {
  return (
    <div className="today page-wide">
      <RootLoadingHeader tab="Today" />
      <div className="page-width">
        <div role="status" aria-live="polite">
          <LoadingMessage title="Today" />
          <div aria-hidden="true" className="motion-safe:animate-pulse">
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
    </div>
  );
}
