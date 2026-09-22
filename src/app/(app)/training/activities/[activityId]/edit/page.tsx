import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ActivityEditor } from "@/components/activities/activity-editor";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { activityFormValues } from "@/lib/activity-form-values";
import { toDateTimeLocal } from "@/lib/time";
import { saveActivityAction } from "@/server/actions/activities";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getActivity } from "@/server/repositories/activities";
import { requireUuid } from "@/server/validation/params";

export const metadata: Metadata = { title: "Correct an activity" };

/** Correct the same record, preserving its sport, occurrence, units and opening revision. */
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
  if (!activity?.actual) notFound();
  const actual = activity.actual;
  const noun = actual.sport === "running" ? "run" : actual.sport === "cycling" ? "ride" : "swim";
  return (
    <>
      <PageHeader title={`Correct the ${noun}`} backHref={`/training/activities/${activityId}`} />
      <PageContent>
        <ActivityEditor
          userId={user.id}
          sport={actual.sport}
          activityId={activityId}
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
            startedAt: toDateTimeLocal(activity.startedAt, profile.timeZone),
            effort:
              activity.effort.status === "reported" ? String(activity.effort.value) : "unsure",
            title: activity.title ?? "",
            notes: activity.notes ?? "",
            outcome: activity.outcome,
          }}
          submitLabel="Save changes"
        />
      </PageContent>
    </>
  );
}
