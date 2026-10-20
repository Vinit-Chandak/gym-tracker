import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";

import { ActivityEditor } from "@/components/activities/activity-editor";
import { enduranceName } from "@/components/activities/endurance-line";
import { SessionPage } from "@/components/shell/session-page";
import { Glyph } from "@/components/ui/glyphs";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { activityFormValues } from "@/lib/activity-form-values";
import { ORIGIN_PARAM, originQuery, parseOrigin } from "@/lib/nav";
import { timeZoneOffsetMinutes, toDateTimeLocal } from "@/lib/time";
import { saveActivityAction } from "@/server/actions/activities";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getActivity } from "@/server/repositories/activities";
import { readSportUnits } from "@/server/repositories/sport-preferences";
import { requireUuid } from "@/server/validation/params";

import { startedAtLine } from "../started-at";

/** The record being corrected, read once a request: the document is named from it too. */
const readActivity = cache(async (activityId: string) => {
  const user = await requireUser();
  return withUser(
    getDb(),
    user.id,
    async (tx) => {
      const found = await getActivity(tx, user.id, activityId);
      return {
        activity: found,
        // How the athlete reads the sport: the distance opens in it, whatever it was entered
        // in, and a swim's lengths also say their distance in it.
        units: found?.actual ? await readSportUnits(tx, user.id) : null,
      };
    },
    { readOnly: true },
  );
});

/** "Correct the run": what the screen's own title says. */
function correctTitle(sport: "running" | "cycling" | "swimming"): string {
  return `Correct the ${sport === "running" ? "run" : sport === "cycling" ? "ride" : "swim"}`;
}

export async function generateMetadata(
  props: PageProps<"/training/activities/[activityId]/edit">,
): Promise<Metadata> {
  const { activityId } = await props.params;
  // A malformed address is the page's to refuse; the title only names what is there.
  if (!z.uuid().safeParse(activityId).success) return { title: "Not found" };
  const { activity } = await readActivity(activityId);
  return { title: activity?.actual ? correctTitle(activity.actual.sport) : "Not found" };
}

/** Correct the same record, preserving its sport, occurrence, units and opening revision. */
export default async function EditActivityPage(
  props: PageProps<"/training/activities/[activityId]/edit">,
) {
  const { activityId } = await props.params;
  requireUuid(activityId);
  const origin = parseOrigin((await props.searchParams)[ORIGIN_PARAM]);
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const { activity, units } = await readActivity(activityId);
  if (!activity?.actual) notFound();
  const actual = activity.actual;
  return (
    // As it was logged (boards Log a run, a ride, a swim): a layer over the tabs, Save pinned,
    // which run it is said by its day and time as its page says it (the form's own When is
    // folded). Opened from the run, it goes back to the run, and says so: "Training" named the
    // tab its path is under, not where Back went.
    <SessionPage
      title={correctTitle(actual.sport)}
      meta={
        <span className="meta-fact">
          <Glyph name="calendar" label="Date" className="glyph-16" />
          {startedAtLine(activity.startedAt, activity.recordedTimeZone, profile.timeZone)}
        </span>
      }
      back={{
        href: `/training/activities/${activityId}${originQuery(origin)}` as Route,
        label: enduranceName(actual.sport),
      }}
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
        // An unconfirmed legacy effort is kept unless another answer is chosen; offering only
        // 1–5 and Not sure would erase it with a correction to anything else (LOG-03).
        keptEffort={
          activity.effort.status === "legacy_unconfirmed" ? { value: activity.effort.value } : null
        }
        initial={{
          ...activityFormValues(actual),
          recordedTimeZone: activity.recordedTimeZone,
          startedAtOffsetMinutes: String(
            timeZoneOffsetMinutes(activity.recordedTimeZone, activity.startedAt),
          ),
          startedAt: toDateTimeLocal(activity.startedAt, activity.recordedTimeZone),
          effort:
            activity.effort.status === "reported"
              ? String(activity.effort.value)
              : activity.effort.status === "legacy_unconfirmed"
                ? "keep"
                : "unsure",
          title: activity.title ?? "",
          notes: activity.notes ?? "",
          outcome: activity.outcome,
        }}
        submitLabel="Save changes"
        units={units ?? undefined}
      />
    </SessionPage>
  );
}
