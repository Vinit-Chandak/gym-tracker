import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";

import { enduranceName, plannedName } from "@/components/activities/endurance-line";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { describePrescription } from "@/domain/activity-prescription";
import { addDays, todayInTimeZone } from "@/domain/program-calendar";
import { holdHyphens, joinFacts } from "@/lib/facts";
import { formatIsoDate } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getActivity } from "@/server/repositories/activities";
import { occurrencesBetween } from "@/server/repositories/occurrences";
import { readSportUnits } from "@/server/repositories/sport-preferences";
import { requireUuid } from "@/server/validation/params";

import { EARLY_DAYS, inOrder, MISSED_DAYS, standing } from "@/app/(app)/today/log/log-choices";
import { CountsAsChoices, type CountsAsChoice } from "./counts-as-choices";

export const metadata: Metadata = { title: "Counts as" };

/**
 * What a logged run, ride or swim counts as (ADR 0058): the planned sessions of its sport from
 * two weeks before the day it was done to the week after, still open or the one it answers now,
 * and Unplanned. Choosing one changes it; the measurements and the date stay as they were.
 */
export default async function CountsAsPage(
  props: PageProps<"/training/activities/[activityId]/counts-as">,
) {
  const { activityId } = await props.params;
  requireUuid(activityId);
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const data = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const activity = await getActivity(tx, user.id, activityId);
      if (!activity || activity.sport === "strength") return null;
      const [sessions, units] = await Promise.all([
        occurrencesBetween(
          tx,
          user.id,
          addDays(activity.occurredOn, -MISSED_DAYS),
          addDays(activity.occurredOn, EARLY_DAYS + 1),
        ),
        readSportUnits(tx, user.id),
      ]);
      const current = activity.origin.occurrenceId;
      return {
        activity,
        units,
        sessions: sessions.filter(
          (session) =>
            session.sport === activity.sport && (session.loggable || session.id === current),
        ),
      };
    },
    { readOnly: true },
  );
  if (!data) notFound();
  const { activity, units } = data;
  const sport = activity.sport;
  const current = activity.origin.occurrenceId;
  const year = todayInTimeZone(profile.timeZone).slice(0, 4);
  const choices: CountsAsChoice[] = [
    ...inOrder(data.sessions, activity.occurredOn).map((session) => ({
      occurrenceId: session.id,
      // Named as Log and Today name it, its figure on the line under it.
      label: holdHyphens(plannedName(session.prescription, sport, units)),
      sub: joinFacts([
        session.scheduledOn === activity.occurredOn
          ? `${formatIsoDate(session.scheduledOn, year)} · same day`
          : standing(session, activity.occurredOn),
        session.prescription && describePrescription(session.prescription, units),
      ]),
      current: session.id === current,
      // The one it answers opens its page: what was planned, a tap from what was done.
      href:
        session.id === current
          ? (`/training/programme/occurrences/${session.id}` as Route)
          : undefined,
    })),
    {
      occurrenceId: null,
      label: `Unplanned ${enduranceName(sport).toLowerCase()}`,
      current: current === null,
    },
  ];
  return (
    <>
      <PageHeader
        title="Counts as"
        meta={joinFacts([
          activity.title ?? enduranceName(sport),
          formatIsoDate(activity.occurredOn, year),
        ])}
        backHref={`/training/activities/${activityId}` as Route}
      />
      <PageContent>
        <CountsAsChoices activityId={activity.id} revision={activity.revision} choices={choices} />
      </PageContent>
    </>
  );
}
