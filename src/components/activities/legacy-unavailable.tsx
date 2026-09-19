import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarDays } from "@/components/ui/icons";
import { LEGACY_UNAVAILABLE } from "@/server/legacy-routes";

/**
 * What an old link says when it cannot be resolved (plan §3.2).
 *
 * Deleted, foreign, or never mapped: the answer is that this one is unavailable. Offering
 * the nearest plausible record instead would mean logging against the wrong session, so the
 * only thing offered here is a way back into Training.
 */
export function LegacyUnavailable() {
  return (
    <>
      <PageHeader title="Not available" backHref="/training" />
      <PageContent>
        <EmptyState
          icon={CalendarDays}
          title="That link cannot be opened"
          description={LEGACY_UNAVAILABLE}
          action={
            <LinkButton href="/training" variant="secondary">
              Go to Training
            </LinkButton>
          }
        />
      </PageContent>
    </>
  );
}
