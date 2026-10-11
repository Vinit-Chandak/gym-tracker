import type { Metadata, Route } from "next";

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
import { isOverdue } from "@/domain/occurrences";
import { todayInTimeZone } from "@/domain/program-calendar";
import type { SportUnits } from "@/lib/distance-units";
import { joinFacts } from "@/lib/facts";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { standaloneSchedule, type ScheduledOccurrence } from "@/server/repositories/occurrences";
import { unitsBySport } from "@/server/repositories/sport-preferences";
import { formatIsoDate } from "@/lib/format";

export const metadata: Metadata = { title: "Scheduled by you" };

/**
 * Standalone scheduled work: what is coming, what was missed, and what was done (SCHED-08).
 * Titled for whose it is, "Scheduled by you": "Scheduled on their own" said neither what nor
 * whose (year audit, October 2026).
 *
 * Programme sessions are not here — they belong to the programme, whose days are Training's
 * cycle. Nothing on this page is a coach target either: scheduling something yourself puts it
 * on the calendar without making it part of a programme.
 *
 * Each session opens its own page, where it is skipped, moved or taken off the calendar, so a
 * session put on the wrong day can be put right before that day comes.
 */
function OccurrenceRow({
  occurrence,
  units,
}: {
  occurrence: ScheduledOccurrence;
  units: SportUnits;
}) {
  const time = occurrence.scheduledLocalTime?.slice(0, 5);
  const page = `/training/programme/occurrences/${occurrence.id}` as Route;
  // Logged is answered on its activity's page; anything still open is decided on its own.
  const open = occurrence.resolution.kind !== "logged";
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-ink-muted uppercase tabular-nums">
            {joinFacts([
              ACTIVITY_SPORT_LABELS[occurrence.sport],
              formatIsoDate(occurrence.scheduledOn),
              time,
            ])}
          </p>
          <h2 className="mt-1 text-base font-medium [overflow-wrap:break-word]">
            {occurrence.prescription
              ? describePrescription(occurrence.prescription, units)
              : "No targets set"}
          </h2>
        </div>
        {occurrence.resolution.kind === "logged" ? (
          <Badge tone="accent">Logged</Badge>
        ) : occurrence.disposition === "skipped" ? (
          <Badge tone="neutral">Skipped</Badge>
        ) : null}
      </div>
      {open && (
        <div className="flex flex-wrap gap-2">
          {occurrence.loggable && (
            <LinkButton
              href={`/training/new?occurrence=${occurrence.id}`}
              variant="secondary"
              className="min-w-0 flex-1"
            >
              Log it
            </LinkButton>
          )}
          <LinkButton href={page} variant="outline" className="min-w-0 flex-1">
            {occurrence.disposition === "skipped"
              ? "Undo skip, move or remove"
              : "Skip, move or remove"}
          </LinkButton>
        </div>
      )}
    </Card>
  );
}

export default async function ScheduledPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const today = todayInTimeZone(profile.timeZone);
  const { schedule, units } = await withUser(
    getDb(),
    user.id,
    async (tx) => ({
      schedule: await standaloneSchedule(tx, user.id, today),
      units: await unitsBySport(tx, user.id),
    }),
    { readOnly: true },
  );
  const unitsOf = (occurrence: ScheduledOccurrence) => units[occurrence.sport];
  // A session taken off the calendar is gone from it, whichever day it was for.
  const kept = (occurrence: ScheduledOccurrence) => occurrence.resolution.kind !== "cancelled";
  const upcoming = schedule.upcoming.filter(kept);
  // A day that has gone by keeps what was logged on it, and what was neither logged nor
  // skipped: that is still owed an answer, and can be logged late, skipped or moved from
  // here. A skipped one has had its answer and is not listed as a debt.
  const missed = schedule.earlier.filter((occurrence) =>
    isOverdue(occurrence, occurrence.resolution, today),
  );
  const done = schedule.earlier.filter((occurrence) => occurrence.resolution.kind === "logged");

  return (
    <>
      <PageHeader title="Scheduled by you" backHref="/training" />
      <PageContent>
        <Section title="Upcoming">
          {upcoming.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title={missed.length > 0 ? "Nothing coming up" : "Nothing scheduled by you"}
              // Where the programme's sessions are, all of them: its days, runs among them, are
              // Training's cycle. "Under Programme" sent a lifter to a page that sent them back.
              description="Sessions you put on the calendar yourself wait here. Your programme's days are on Training, a cycle at a time, and today's sessions are on Today."
              action={
                <LinkButton href="/training/schedule" variant="secondary">
                  Schedule an activity
                </LinkButton>
              }
            />
          ) : (
            upcoming.map((occurrence) => (
              <OccurrenceRow
                key={occurrence.id}
                occurrence={occurrence}
                units={unitsOf(occurrence)}
              />
            ))
          )}
        </Section>
        {missed.length > 0 && (
          <Section title="Missed">
            {missed.map((occurrence) => (
              <OccurrenceRow
                key={occurrence.id}
                occurrence={occurrence}
                units={unitsOf(occurrence)}
              />
            ))}
          </Section>
        )}
        {done.length > 0 && (
          <Section title="Earlier">
            {done.map((occurrence) => (
              <OccurrenceRow
                key={occurrence.id}
                occurrence={occurrence}
                units={unitsOf(occurrence)}
              />
            ))}
          </Section>
        )}
      </PageContent>
    </>
  );
}
