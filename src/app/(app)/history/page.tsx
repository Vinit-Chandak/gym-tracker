import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "History" };

export default function HistoryPage() {
  return (
    <>
      <PageHeader title="History" />
      <PageContent>
        <EmptyState
          icon={CalendarDays}
          title="No sessions yet"
          description="Workout, run and recovery history will appear here, with machine-specific filters so stack numbers from different gyms are never mixed."
          phase={7}
        />
      </PageContent>
    </>
  );
}
