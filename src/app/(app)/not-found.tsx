import { MapPin } from "@/components/ui/icons";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <>
      <PageHeader title="Not found" backHref="/today" />
      <PageContent>
        <EmptyState
          icon={MapPin}
          title="Nothing here"
          description="That page or item does not exist, or it belongs to a different account."
        />
      </PageContent>
    </>
  );
}
