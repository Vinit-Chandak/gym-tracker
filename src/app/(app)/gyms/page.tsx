import type { Metadata } from "next";
import { MapPin } from "lucide-react";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Gyms" };

export default function GymsPage() {
  return (
    <>
      <PageHeader title="Gyms" />
      <PageContent>
        <EmptyState
          icon={MapPin}
          title="No gyms yet"
          description="Add each gym you train at and the exact machines it has. Machine history is tracked per equipment instance."
          phase={2}
        />
      </PageContent>
    </>
  );
}
