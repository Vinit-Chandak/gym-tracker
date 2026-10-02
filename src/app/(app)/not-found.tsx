import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MapPin } from "@/components/ui/icons";

/** Inside the shell, so the tab bar is still there; the back control and a ruled way out too. */
export default function NotFound() {
  return (
    <>
      <PageHeader title="Not found" backHref="/today" />
      <PageContent>
        <EmptyState
          icon={MapPin}
          title="Nothing here"
          description="That page or item does not exist, or it belongs to a different account."
          action={
            <LinkButton href="/today" variant="secondary">
              Back to Today
            </LinkButton>
          }
        />
      </PageContent>
    </>
  );
}
