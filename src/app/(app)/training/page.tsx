import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CalendarDays, ClipboardList } from "@/components/ui/icons";
import { LinkRow, List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { SPORT_ICON } from "@/components/ui/sport-chip";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORT_LABELS, ENDURANCE_SPORTS } from "@/domain/activity";
import { outstanding } from "@/domain/occurrences";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireUser } from "@/server/auth";
import { getActiveSession } from "@/server/queries/active-session";
import { getRequestProfile } from "@/server/queries/request-profile";
import { listTemplates } from "@/server/repositories/activity-templates";
import { standaloneSchedule } from "@/server/repositories/occurrences";
import { enabledSportsFor } from "@/server/repositories/sport-preferences";
import { SPORT_TONE, TONE_FILL } from "@/lib/sport-tone";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Training" };

/**
 * Coming back to this tab within a minute shows what it showed, without asking the server
 * (ADR 0030). Any change made in the app clears that copy at once; only a change made
 * elsewhere, on another device or by the coach, can take up to the minute to appear.
 */
export const unstable_dynamicStaleTime = 60;

/**
 * Where training is entered and managed (plan §2.3).
 *
 * Not a second history and not a second Today. This is where you come to log something,
 * schedule something, open the programme or pick up work you left unfinished. What actually
 * happened lives in History; what is scheduled for today lives on Today.
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
        templates: await listTemplates(tx, user.id, {}),
        standalone: await standaloneSchedule(tx, user.id, today),
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
  // keeps only what was logged on them.
  const upcoming = outstanding(data.standalone.upcoming).length;

  return (
    <>
      <PageHeader title="Training" />
      <PageContent>
        {inProgress && (
          <Card className="bg-lift-soft">
            <p className="flex items-center gap-2 font-semibold text-lift-ink">
              <span aria-hidden className="size-2 rounded-full bg-lift" />A lifting session is still
              open
            </p>
            <p className="text-sm text-ink-muted">It stays here until you finish or discard it.</p>
            <LinkButton href={`/workouts/${inProgress.id}`} className="w-full">
              Resume the session
            </LinkButton>
          </Card>
        )}

        {/* The sport is the first thing logging needs, so it is asked once, here: one tile
            per sport, in its colour. A filter above and a chooser on the next screen were the
            same question in two places. */}
        <Section
          title="Log an activity"
          info={
            <>
              Lifting has its own logger, started from Today or from a gym. Logging something you
              have already done never counts against a scheduled session unless you open that
              session and log it.
            </>
          }
        >
          <ul className="grid grid-cols-1 gap-3 min-[22rem]:grid-cols-3">
            {ordered.map((sport) => {
              const Icon = SPORT_ICON[sport];
              return (
                <li key={sport}>
                  <Link
                    href={`/training/new?sport=${sport}`}
                    className={cn(
                      "flex min-h-16 pressable items-center gap-3 rounded-tile p-4 min-[22rem]:min-h-28 min-[22rem]:flex-col min-[22rem]:items-start min-[22rem]:justify-between",
                      TONE_FILL[SPORT_TONE[sport]],
                    )}
                  >
                    <Icon scale="feature" aria-hidden />
                    <span className="font-display text-display-s">
                      {ACTIVITY_SPORT_LABELS[sport]}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <LinkButton href="/training/schedule" variant="secondary" className="w-full">
            Schedule an activity
          </LinkButton>
        </Section>

        {/* One-off work only. The programme's own sessions live with the programme, and
            counting them here would say "0 upcoming" to somebody whose Today screen is
            showing them a run to do. */}
        <List>
          <li>
            <LinkRow
              href="/training/scheduled"
              icon={CalendarDays}
              title="Scheduled on their own"
              subtitle="Upcoming and earlier"
              meta={`${upcoming} upcoming`}
            />
          </li>
          <li>
            <LinkRow
              href="/training/templates"
              icon={ClipboardList}
              title="Templates"
              meta={`${data.templates.length} saved`}
            />
          </li>
        </List>
      </PageContent>
    </>
  );
}
