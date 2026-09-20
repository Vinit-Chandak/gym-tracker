import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORT_LABELS, ENDURANCE_SPORTS } from "@/domain/activity";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireUser } from "@/server/auth";
import { getActiveSession } from "@/server/queries/active-session";
import { getRequestProfile } from "@/server/queries/request-profile";
import { listTemplates } from "@/server/repositories/activity-templates";
import { standaloneSchedule } from "@/server/repositories/occurrences";
import { enabledSportsFor } from "@/server/repositories/sport-preferences";

export const metadata: Metadata = { title: "Training" };

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
  const upcoming = data.standalone.upcoming.length;
  const earlier = data.standalone.earlier.filter(
    (occurrence) => occurrence.resolution.kind === "incomplete",
  ).length;

  return (
    <>
      <PageHeader title="Training" />
      <PageContent>
        {inProgress && (
          <Section title="Unfinished">
            <Card>
              <p className="text-sm text-ink-muted">
                A lifting session is still open. It stays here until you finish or discard it.
              </p>
              <LinkButton
                href={`/workouts/${inProgress.id}`}
                variant="secondary"
                className="w-full"
              >
                Resume the session
              </LinkButton>
            </Card>
          </Section>
        )}

        {/* The sport is the first thing logging needs, so it is asked once, here. A filter
            above and a chooser on the next screen were the same question in two places. */}
        <Section title="Log or schedule">
          <Card>
            <div className="action-row">
              {ordered.map((sport) => (
                <LinkButton key={sport} href={`/training/new?sport=${sport}`} className="w-full">
                  {ACTIVITY_SPORT_LABELS[sport]}
                </LinkButton>
              ))}
            </div>
            <p className="text-sm text-ink-muted">
              Lifting has its own logger, started from Today or from a gym.
            </p>
            <LinkButton href="/training/schedule" variant="secondary" className="w-full">
              Schedule an activity
            </LinkButton>
            <p className="text-sm text-ink-muted">
              Logging something you have already done never counts against a scheduled session
              unless you open that session and log it.
            </p>
          </Card>
        </Section>

        {/* One-off work only. The programme's own sessions have their own section below, and
            counting them here would say "0 upcoming" to somebody whose Today screen is
            showing them a run to do. */}
        <Section title="Scheduled on their own">
          <Card>
            <p className="text-sm text-ink-muted tabular-nums">
              {upcoming} upcoming
              {earlier > 0 ? ` · ${earlier} still to do from earlier` : ""}
            </p>
            <p className="text-sm text-ink-muted">
              Sessions you put on the calendar yourself. Your programme&apos;s own sessions are
              under Programme.
            </p>
            <LinkButton href="/training/scheduled" variant="secondary" className="w-full">
              Upcoming and earlier
            </LinkButton>
          </Card>
        </Section>

        <Section title="Templates">
          <Card>
            <p className="text-sm text-ink-muted tabular-nums">
              {data.templates.length} saved session
              {data.templates.length === 1 ? "" : "s"}
            </p>
            <LinkButton href="/training/templates" variant="secondary" className="w-full">
              Templates
            </LinkButton>
          </Card>
        </Section>
      </PageContent>
    </>
  );
}
