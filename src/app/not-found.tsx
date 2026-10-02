import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MapPin } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Not found" };

/**
 * Catches URLs that match no route at all. Without this, Next's bare default 404
 * renders outside the shell, which in the installed PWA is a dead end: there is no
 * browser chrome to go back with, so the only way out is force-quitting the app. With
 * no tab bar here, the one way back is the screen's one highlighter.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <PageHeader title="Not found" />
      <PageContent>
        <EmptyState
          icon={MapPin}
          title="Nothing here"
          description="That page does not exist. The link may be out of date, or the address may have a typo."
          action={<LinkButton href="/today">Back to Today</LinkButton>}
        />
      </PageContent>
    </div>
  );
}
