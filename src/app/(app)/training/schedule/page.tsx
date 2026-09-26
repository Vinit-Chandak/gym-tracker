import type { Metadata } from "next";

import { ScheduleForm } from "@/components/activities/schedule-form";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import {
  ENDURANCE_SPORTS,
  isActivitySport,
  isEnduranceSport,
  type EnduranceSport,
} from "@/domain/activity";
import { describePrescription } from "@/domain/activity-prescription";
import { todayInTimeZone } from "@/domain/program-calendar";
import { scheduleActivityAction } from "@/server/actions/occurrences";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { listTemplates } from "@/server/repositories/activity-templates";

export const metadata: Metadata = { title: "Schedule an activity" };

/**
 * Putting one session on the calendar (plan §3.1).
 *
 * Standalone by design: it is a date and, optionally, a template. It does not create a
 * programme, and it is not coached — only the active programme's work is (SCHED-08).
 */
export default async function SchedulePage(props: PageProps<"/training/schedule">) {
  const search = await props.searchParams;
  const requested = typeof search.sport === "string" ? search.sport : null;
  const sport: EnduranceSport =
    requested && isActivitySport(requested) && isEnduranceSport(requested) ? requested : "running";

  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const templates = await withUser(getDb(), user.id, (tx) => listTemplates(tx, user.id), {
    readOnly: true,
  });

  return (
    <>
      <PageHeader title="Schedule an activity" backHref="/training" />
      <PageContent>
        <ScheduleForm
          action={scheduleActivityAction}
          sport={sport}
          sports={ENDURANCE_SPORTS}
          today={todayInTimeZone(profile.timeZone)}
          templates={templates.map((template) => ({
            sport: template.sport,
            id: template.id,
            revisionId: template.revisionId,
            name: template.name,
            summary: describePrescription(template.prescription),
          }))}
        />
      </PageContent>
    </>
  );
}
