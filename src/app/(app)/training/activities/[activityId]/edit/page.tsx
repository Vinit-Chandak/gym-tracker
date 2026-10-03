import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";

import { ActivityEditor } from "@/components/activities/activity-editor";
import { SessionPage } from "@/components/shell/session-page";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { activityFormValues } from "@/lib/activity-form-values";
import { ORIGIN_PARAM, originQuery, parseOrigin } from "@/lib/nav";
import { timeZoneOffsetMinutes, toDateTimeLocal } from "@/lib/time";
import { saveActivityAction } from "@/server/actions/activities";
import { requireUser } from "@/server/auth";
import { getActivity } from "@/server/repositories/activities";
import { requireUuid } from "@/server/validation/params";

export const metadata: Metadata = { title: "Correct an activity" };

/** Correct the same record, preserving its sport, occurrence, units and opening revision. */
export default async function EditActivityPage(
  props: PageProps<"/training/activities/[activityId]/edit">,
) {
  const { activityId } = await props.params;
  requireUuid(activityId);
  const origin = parseOrigin((await props.searchParams)[ORIGIN_PARAM]);
  const user = await requireUser();
  const activity = await withUser(getDb(), user.id, (tx) => getActivity(tx, user.id, activityId), {
    readOnly: true,
  });
  if (!activity?.actual) notFound();
  const actual = activity.actual;
  const noun = actual.sport === "running" ? "run" : actual.sport === "cycling" ? "ride" : "swim";
  return (
    // As it was logged (boards Log a run, a ride, a swim): a layer over the tabs, Save pinned.
    <SessionPage
      title={`Correct the ${noun}`}
      back={{ href: `/training/activities/${activityId}${originQuery(origin)}` as Route }}
    >
      <ActivityEditor
        userId={user.id}
        sport={actual.sport}
        activityId={activityId}
        origin={origin}
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
          ...activityFormValues(actual),
          recordedTimeZone: activity.recordedTimeZone,
          startedAtOffsetMinutes: String(
            timeZoneOffsetMinutes(activity.recordedTimeZone, activity.startedAt),
          ),
          startedAt: toDateTimeLocal(activity.startedAt, activity.recordedTimeZone),
          effort: activity.effort.status === "reported" ? String(activity.effort.value) : "unsure",
          title: activity.title ?? "",
          notes: activity.notes ?? "",
          outcome: activity.outcome,
        }}
        submitLabel="Save changes"
      />
    </SessionPage>
  );
}
