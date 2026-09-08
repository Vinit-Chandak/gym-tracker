import { PageHeader } from "./page-header";
import { PageContent } from "./page-content";

export function LoadingPage({ title = "Loading" }: { title?: string }) {
  return (
    <>
      <PageHeader title={title} />
      <PageContent>
        <div role="status" aria-live="polite" className="space-y-4">
          <p className="text-sm text-ink-muted">
            Loading {title === "Loading" ? "page" : title.toLowerCase()}…
          </p>
          <div aria-hidden="true" className="space-y-4 motion-safe:animate-pulse">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-4 rounded-card border border-line bg-surface p-4">
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
