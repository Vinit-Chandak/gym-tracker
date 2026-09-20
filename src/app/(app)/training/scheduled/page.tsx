import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarDays } from "@/components/ui/icons";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORT_LABELS } from "@/domain/activity";
import { describePrescription } from "@/domain/activity-prescription";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { standaloneSchedule, type ScheduledOccurrence } from "@/server/repositories/occurrences";
import { formatIsoDate } from "@/lib/format";

export const metadata: Metadata = { title: "Scheduled" };

/**
 * Standalone scheduled work: what is coming, and what is behind (SCHED-08).
 *
 * Programme sessions are not here — they belong to the programme, which has its own full
 * view. Nothing on this page is a coach target either: scheduling something yourself puts it
 * on the calendar without making it part of a programme.
 */
function OccurrenceRow({ occurrence, late }: { occurrence: ScheduledOccurrence; late: boolean }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">
            {ACTIVITY_SPORT_LABELS[occurrence.sport]} · {formatIsoDate(occurrence.scheduledOn)}
          </p>
          <h2 className="mt-1 text-base font-medium [overflow-wrap:anywhere]">
            {occurrence.prescription
              ? describePrescription(occurrence.prescription)
              : "No targets set"}
          </h2>
        </div>
        {occurrence.resolution.kind === "logged" ? (
          <Badge tone="accent">Logged</Badge>
        ) : occurrence.disposition === "skipped" ? (
          <Badge tone="neutral">Skipped</Badge>
        ) : late ? (
          <Badge tone="neutral">Not done</Badge>
        ) : null}
      </div>
      {occurrence.loggable && (
        <LinkButton
          href={`/training/new?occurrence=${occurrence.id}`}
          variant="secondary"
          className="w-full"
        >
          Log it
        </LinkButton>
      )}
    </Card>
  );
}

export default async function ScheduledPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const today = todayInTimeZone(profile.timeZone);
  const { upcoming, earlier } = await withUser(
    getDb(),
    user.id,
    (tx) => standaloneSchedule(tx, user.id, today),
    { readOnly: true },
  );

  return (
    <>
      <PageHeader title="Scheduled on their own" backHref="/training" />
      <PageContent>
        <Section title="Upcoming">
          {upcoming.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Nothing scheduled on its own"
              description="Sessions you put on the calendar yourself wait here. Your programme's own sessions are under Programme, and today's are on Today."
              action={
                <LinkButton href="/training/schedule" variant="secondary">
                  Schedule an activity
                </LinkButton>
              }
            />
          ) : (
            upcoming.map((occurrence) => (
              <OccurrenceRow key={occurrence.id} occurrence={occurrence} late={false} />
            ))
          )}
        </Section>
        {earlier.length > 0 && (
          <Section title="Earlier">
            {earlier.map((occurrence) => (
              <OccurrenceRow key={occurrence.id} occurrence={occurrence} late />
            ))}
          </Section>
        )}
      </PageContent>
    </>
  );
}
