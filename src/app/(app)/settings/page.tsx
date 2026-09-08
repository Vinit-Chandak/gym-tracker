import type { Metadata } from "next";
import { Settings } from "lucide-react";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <PageContent>
        <EmptyState
          icon={Settings}
          title="Settings"
          description="Account, default gym, units, time zone and coach-API tokens will be managed here."
          phase={1}
        />
        <Card>
          <h2 className="text-base font-semibold">Install on iPhone</h2>
          <p className="text-sm text-ink-muted">
            Open this site in Safari, tap Share, then “Add to Home Screen”. It launches full-screen
            like a native app.
          </p>
        </Card>
      </PageContent>
    </>
  );
}
