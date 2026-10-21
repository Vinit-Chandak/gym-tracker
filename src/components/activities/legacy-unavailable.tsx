import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarDays } from "@/components/ui/icons";

/**
 * What an old link says when it cannot be resolved (plan §3.2).
 *
 * Deleted, foreign, or never mapped: the answer is that this one is unavailable. Offering
 * the nearest plausible record instead would mean logging against the wrong session, so the
 * only way on is the way back, into Plan, which the header's back link already is.
 */
export function LegacyUnavailable() {
  return (
    <>
      <PageHeader title="Not available" backHref="/plan" />
      <PageContent>
        <EmptyState icon={CalendarDays} title="This link no longer works" />
      </PageContent>
    </>
  );
}
