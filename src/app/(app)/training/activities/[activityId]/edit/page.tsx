import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RunningForm } from "@/components/activities/running-form";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { toDateTimeLocal } from "@/lib/time";
import { saveActivityAction } from "@/server/actions/activities";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getActivity } from "@/server/repositories/activities";
import { requireUuid } from "@/server/validation/params";

export const metadata: Metadata = { title: "Correct an activity" };

/**
 * Correcting a record (plan §5.2).
 *
 * The same activity, the same sport, the same thing it answered for: only the measurements,
 * the environment and the notes can change here. The version it was opened at travels with
 * the form, so an edit written against an older version is refused rather than merged.
 */
export default async function EditActivityPage(
  props: PageProps<"/training/activities/[activityId]/edit">,
) {
  const { activityId } = await props.params;
  requireUuid(activityId);
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const activity = await withUser(getDb(), user.id, (tx) => getActivity(tx, user.id, activityId), {
    readOnly: true,
  });
  if (!activity || activity.actual?.sport !== "running") notFound();
  const actual = activity.actual;
  const totalSeconds = Math.round((activity.durationMs ?? 0) / 1000);

  return (
    <>
      <PageHeader title="Correct the run" backHref={`/training/activities/${activityId}`} />
      <PageContent>
        <RunningForm
          action={saveActivityAction.bind(null, activityId)}
          submissionKey={crypto.randomUUID()}
          occurrence={
            activity.origin.kind === "planned"
              ? {
                  id: activity.origin.occurrenceId,
                  revisionId: activity.origin.performedRevisionId,
                  planId: activity.origin.performedPlanId,
                }
              : null
          }
          expectedRevision={activity.revision}
          initial={{
            startedAt: toDateTimeLocal(activity.startedAt, profile.timeZone),
            environment: actual.environment,
            distanceValue: String(actual.distance.value),
            distanceUnit: actual.distance.unit,
            hours: String(Math.floor(totalSeconds / 3600)),
            minutes: String(Math.floor((totalSeconds % 3600) / 60)),
            seconds: String(totalSeconds % 60),
            effort:
              activity.effort.status === "reported" ? String(activity.effort.value) : "unsure",
            surface: actual.surface ?? "",
            elevationGainMetres:
              actual.elevationGainMetres === null ? "" : String(actual.elevationGainMetres),
            treadmillInclinePercent:
              actual.treadmillInclinePercent === null ? "" : String(actual.treadmillInclinePercent),
            cadenceStepsPerMinute:
              actual.cadenceStepsPerMinute === null ? "" : String(actual.cadenceStepsPerMinute),
            averageHeartRate:
              actual.averageHeartRate === null ? "" : String(actual.averageHeartRate),
            maxHeartRate: actual.maxHeartRate === null ? "" : String(actual.maxHeartRate),
            title: activity.title ?? "",
            notes: activity.notes ?? "",
          }}
          submitLabel="Save changes"
        />
      </PageContent>
    </>
  );
}
