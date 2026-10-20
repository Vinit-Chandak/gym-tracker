import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";

import { PreviewShell } from "../../preview-shell";
import { ActivityPreview } from "./activity-preview";

export const metadata: Metadata = { title: "Preview · Log a run" };

const TITLES = { running: "Log a run", cycling: "Log a ride", swimming: "Log a swim" } as const;

/**
 * Logging a run, a ride or a swim against nothing: `?sport=` picks the form, `?filled=1` opens
 * it holding an entry, as a correction does.
 */
export default async function ActivityPreviewPage(props: PageProps<"/preview/activity">) {
  const { sport: asked, filled } = await props.searchParams;
  const sport = asked === "cycling" || asked === "swimming" ? asked : "running";
  return (
    <PreviewShell tab="/today">
      <PageHeader title={TITLES[sport]} backHref="/preview" />
      <PageContent>
        <ActivityPreview sport={sport} filled={filled === "1"} />
      </PageContent>
    </PreviewShell>
  );
}
