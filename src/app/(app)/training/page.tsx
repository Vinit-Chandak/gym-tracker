import type { Metadata } from "next";

import { OccurrenceRow } from "@/components/activities/occurrence-row";
import { SPORT_ICONS, sportNoun } from "@/components/activities/sport-icons";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { CalendarDays, ClipboardList, Repeat } from "@/components/ui/icons";
import { LinkRow, List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ENDURANCE_SPORTS } from "@/domain/activity";
import { todayInTimeZone } from "@/domain/program-calendar";
import { formatDateTime, formatRelativeDay } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { getActiveSession } from "@/server/queries/active-session";
import { getRequestProfile } from "@/server/queries/request-profile";
import { countActiveTemplates } from "@/server/repositories/activity-templates";
import { standaloneSchedule } from "@/server/repositories/occurrences";
import { getActiveProgram } from "@/server/repositories/schedule";
import { enabledSportsFor } from "@/server/repositories/sport-preferences";

export const metadata: Metadata = { title: "Training" };

/**
 * Coming back to this tab within a minute shows what it showed, without asking the server
 * (ADR 0030). Any change made in the app clears that copy at once; only a change made
 * elsewhere, on another device or by the coach, can take up to the minute to appear.
 */
export const unstable_dynamicStaleTime = 60;

/** How many of the sessions still owed are listed on the tab itself; the rest are one tap away. */
const UP_NEXT = 3;

/**
 * Where training is entered and managed (plan §2.3): the week's other work.
 *
 * Not a second history and not a second Today. The sessions you put on the calendar yourself
 * open the page, because they are what is owed next; then the ways to log or schedule; then
 * the lists behind them. What actually happened lives in History; what is scheduled for
 * today lives on Today.
 */
export default async function TrainingPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const today = todayInTimeZone(profile.timeZone);
  const [inProgress, data] = await Promise.all([
    getActiveSession(user.id),
    withUser(
      getDb(),
      user.id,
      async (tx) => ({
        templateCount: await countActiveTemplates(tx, user.id),
        schedule: await standaloneSchedule(tx, user.id, today),
        programme: await getActiveProgram(tx, user.id),
        // The sports this account actually trains are offered first, as the chooser did.
        preferred: await enabledSportsFor(tx, user.id),
      }),
      { readOnly: true },
    ),
  ]);
  const ordered = [...ENDURANCE_SPORTS].sort(
    (a, b) => Number(data.preferred.includes(b)) - Number(data.preferred.includes(a)),
  );
  // Work still owed rather than rows on the calendar, so a session scheduled for today and then
  // logged stops being counted the moment it is logged. Days gone by are not counted: the list
  // keeps only what was logged on them. One-off work only: the programme's own sessions have
  // their own row below, and counting them here would say "0 upcoming" to somebody whose Today
  // screen is showing them a run to do.
  const owed = data.schedule.upcoming.filter(
    (occurrence) =>
      occurrence.disposition === "pending" && occurrence.resolution.kind === "incomplete",
  );
  const upcoming = owed.length;

  return (
    <>
      <PageHeader title="Training" />
      <PageContent>
        {inProgress && (
          <Section title="Unfinished">
            {/* The session in progress stands off the page: it is the one thing here that is
                already under way. */}
            <section className="panel space-y-3 p-4">
              <h2 className="text-lg font-semibold">A lifting session is still open</h2>
              <p className="text-sm text-ink-muted tabular-nums">
                {inProgress.gymName} · {formatDateTime(inProgress.startedAt, profile.timeZone)}. It
                stays here until you finish or discard it.
              </p>
              <LinkButton href={`/workouts/${inProgress.id}`} size="lg" className="w-full">
                Resume the session
              </LinkButton>
            </section>
          </Section>
        )}

        {/* What is owed next, before the ways to add to it. */}
        {owed.length > 0 && (
          <Section title="Up next">
            <ul className="box-rows">
              {owed.slice(0, UP_NEXT).map((occurrence) => (
                <OccurrenceRow
                  key={occurrence.id}
                  occurrence={occurrence}
                  when={formatRelativeDay(occurrence.scheduledOn, today)}
                />
              ))}
            </ul>
          </Section>
        )}

        {/* The sport is the first thing logging needs, so it is asked once, here. A filter
            above and a chooser on the next screen were the same question in two places. */}
        <Section
          title="Log or schedule"
          info="Lifting has its own logger, started from Today or from a gym. Logging something you have already done never counts against a scheduled session unless you open that session and log it."
        >
          <List>
            {ordered.map((sport) => (
              <li key={sport}>
                <LinkRow
                  href={`/training/new?sport=${sport}`}
                  icon={SPORT_ICONS[sport]}
                  title={`Log a ${sportNoun(sport)}`}
                />
              </li>
            ))}
          </List>
          <LinkButton href="/training/schedule" variant="secondary" className="w-full">
            Schedule an activity
          </LinkButton>
        </Section>

        <Section
          title="Scheduled and saved"
          info="Sessions you put on the calendar yourself. Your programme's own sessions are under Programme."
        >
          <List>
            <li>
              <LinkRow
                href="/training/scheduled"
                icon={CalendarDays}
                title="Upcoming and earlier"
                meta={`${upcoming} upcoming`}
              />
            </li>
            <li>
              <LinkRow
                href="/training/programme"
                icon={ClipboardList}
                title="Programme"
                meta={data.programme?.name ?? "No active programme"}
              />
            </li>
            <li>
              <LinkRow
                href="/training/templates"
                icon={Repeat}
                title="Templates"
                meta={`${data.templateCount} saved session${data.templateCount === 1 ? "" : "s"}`}
              />
            </li>
          </List>
        </Section>
      </PageContent>
    </>
  );
}
