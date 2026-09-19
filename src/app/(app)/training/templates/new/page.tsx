import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PrescriptionEditor } from "@/components/activities/prescription-editor";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { isActivitySport, isEnduranceSport, type EnduranceSport } from "@/domain/activity";
import { enabledSports, multisportRollout } from "@/lib/multisport-rollout";
import { saveTemplateAction } from "@/server/actions/activity-templates";
import { requireUser } from "@/server/auth";

export const metadata: Metadata = { title: "New template" };

export default async function NewTemplatePage(props: PageProps<"/training/templates/new">) {
  const rollout = multisportRollout();
  if (!rollout.sharedNavigation) notFound();
  await requireUser();
  const search = await props.searchParams;
  const requested = typeof search.sport === "string" ? search.sport : null;
  const sport: EnduranceSport =
    requested && isActivitySport(requested) && isEnduranceSport(requested) ? requested : "running";
  const sports = enabledSports(rollout).filter(
    (item): item is EnduranceSport => item !== "strength",
  );

  return (
    <>
      <PageHeader title="New template" backHref="/training/templates" />
      <PageContent>
        <PrescriptionEditor
          action={saveTemplateAction.bind(null, null)}
          sport={sport}
          sports={sports}
          initial={{ sport, distanceUnit: sport === "swimming" ? "m" : "km" }}
          submitLabel="Save template"
        />
      </PageContent>
    </>
  );
}
