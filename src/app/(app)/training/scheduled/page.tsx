import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarDays, ChevronRight } from "@/components/ui/icons";
import { PRESSABLE_ROW_CLASS, ROW_CLASS, List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { SportChip } from "@/components/ui/sport-chip";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORT_LABELS } from "@/domain/activity";
import { describePrescription } from "@/domain/activity-prescription";
import { todayInTimeZone } from "@/domain/program-calendar";
import { formatIsoWeekdayDay } from "@/lib/format";
import { SPORT_TONE } from "@/lib/sport-tone";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { standaloneSchedule, type ScheduledOccurrence } from "@/server/repositories/occurrences";

export const metadata: Metadata = { title: "Scheduled" };

/**
 * Standalone scheduled work: what is coming, and what was done (SCHED-08).
 *
 * Programme sessions are not here — they belong to the programme, which has its own full
 * view. Nothing on this page is a coach target either: scheduling something yourself puts it
 * on the calendar without making it part of a programme.
 */
function OccurrenceRow({ occurrence, today }: { occurrence: ScheduledOccurrence; today: string }) {
  const time = occurrence.scheduledLocalTime?.slice(0, 5) ?? null;
  const when =
    occurrence.scheduledOn === today ? "Today" : formatIsoWeekdayDay(occurrence.scheduledOn);
  // The sport, the day and the time on one line; what it asks for under it, as on Today.
  const meta = [ACTIVITY_SPORT_LABELS[occurrence.sport], when, time].filter(Boolean).join(", ");
  const body = (
    <>
      <SportChip sport={occurrence.sport} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm [overflow-wrap:anywhere] text-ink-muted tabular-nums">
          {meta}
        </span>
        <span className="block text-headline leading-snug font-semibold [overflow-wrap:anywhere]">
          {occurrence.prescription
            ? describePrescription(occurrence.prescription)
            : "No targets set"}
        </span>
      </span>
    </>
  );

  // Answered: the row opens what was logged, as a finished session on Today does.
  if (occurrence.resolution.kind === "logged") {
    return (
      <Link
        href={`/training/activities/${occurrence.resolution.activityId}`}
        prefetch="intent"
        className={PRESSABLE_ROW_CLASS}
      >
        {body}
        <Badge tone="success">Logged</Badge>
        <ChevronRight className="-ml-1 shrink-0 text-ink-subtle" aria-hidden />
      </Link>
    );
  }
  return (
    <div className={ROW_CLASS}>
      {body}
      <span className="flex shrink-0 flex-col items-end gap-1.5">
        {occurrence.disposition === "skipped" && <Badge tone="neutral">Skipped</Badge>}
        {occurrence.loggable && (
          <LinkButton
            href={`/training/new?occurrence=${occurrence.id}`}
            variant="secondary"
            tone={SPORT_TONE[occurrence.sport]}
            size="sm"
          >
            Log it
          </LinkButton>
        )}
      </span>
    </div>
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
  // A day that has gone by keeps only what was logged on it: a session that was not done, or
  // was skipped, is not a record of anything, and listing it only read as a debt.
  const done = earlier.filter((occurrence) => occurrence.resolution.kind === "logged");

  return (
    <>
      <PageHeader title="Scheduled on their own" backHref="/training" />
      <PageContent>
        <Section
          title="Upcoming"
          info={
            upcoming.length > 0
              ? "Sessions you put on the calendar yourself. Today's are on Today too; your programme's own sessions are under Programme."
              : undefined
          }
        >
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
            <List>
              {upcoming.map((occurrence) => (
                <li key={occurrence.id}>
                  <OccurrenceRow occurrence={occurrence} today={today} />
                </li>
              ))}
            </List>
          )}
        </Section>
        {done.length > 0 && (
          <Section title="Earlier">
            <List>
              {done.map((occurrence) => (
                <li key={occurrence.id}>
                  <OccurrenceRow occurrence={occurrence} today={today} />
                </li>
              ))}
            </List>
          </Section>
        )}
      </PageContent>
    </>
  );
}
