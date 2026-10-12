import type { Metadata } from "next";

import { PrescriptionEditor } from "@/components/activities/prescription-editor";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import {
  ENDURANCE_SPORTS,
  isActivitySport,
  isEnduranceSport,
  type EnduranceSport,
} from "@/domain/activity";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { readingUnit } from "@/lib/distance-units";
import { saveTemplateAction } from "@/server/actions/activity-templates";
import { requireUser } from "@/server/auth";
import { readSportUnits } from "@/server/repositories/sport-preferences";

export const metadata: Metadata = { title: "New template" };

export default async function NewTemplatePage(props: PageProps<"/training/templates/new">) {
  const user = await requireUser();
  const search = await props.searchParams;
  const requested = typeof search.sport === "string" ? search.sport : null;
  const sport: EnduranceSport =
    requested && isActivitySport(requested) && isEnduranceSport(requested) ? requested : "running";
  // A distance is first offered in the unit the athlete reads this sport in.
  const unit = readingUnit(
    sport,
    await withUser(getDb(), user.id, (tx) => readSportUnits(tx, user.id), { readOnly: true }),
  );

  return (
    <>
      <PageHeader title="New template" backHref="/training/templates" />
      <PageContent>
        <PrescriptionEditor
          action={saveTemplateAction.bind(null, null)}
          sport={sport}
          sports={ENDURANCE_SPORTS}
          initial={{ sport, distanceUnit: unit, stepDistanceUnit: unit }}
          submitLabel="Save template"
        />
      </PageContent>
    </>
  );
}
