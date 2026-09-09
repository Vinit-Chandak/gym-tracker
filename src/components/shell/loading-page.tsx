import { PageHeader } from "./page-header";
import { PageContent } from "./page-content";
import { LoadingMessage } from "./navigation-feedback";

export function LoadingPage({ title = "Loading" }: { title?: string }) {
  return (
    <>
      <PageHeader title={title} />
      <PageContent>
        <div role="status" aria-live="polite" className="space-y-4">
          <LoadingMessage title={title} />
          <div
            aria-hidden="true"
            className="grid gap-[var(--section-gap)] motion-safe:animate-pulse md:grid-cols-2"
          >
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-4 rounded-card bg-surface panel-padding">
                <div className="h-5 w-2/3 rounded bg-surface-raised" />
                <div className="h-4 w-full rounded bg-surface-raised" />
                <div className="h-12 rounded-control bg-surface-raised" />
              </div>
            ))}
          </div>
        </div>
      </PageContent>
    </>
  );
}
