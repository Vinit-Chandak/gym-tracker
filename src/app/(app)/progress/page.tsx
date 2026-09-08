import type { Metadata } from "next";
import { TrendingUp } from "lucide-react";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Progress" };

export default function ProgressPage() {
  return (
    <>
      <PageHeader title="Progress" />
      <PageContent>
        <EmptyState
          icon={TrendingUp}
          title="Nothing to chart yet"
          description="Estimated 1RM trends, weekly sets per muscle group, run volume, symptoms and adherence will live here."
          phase={7}
        />
      </PageContent>
    </>
  );
}
