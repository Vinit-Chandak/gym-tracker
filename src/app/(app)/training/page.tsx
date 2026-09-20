import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { SegmentedLinks } from "@/components/ui/segmented-links";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import {
  ACTIVITY_SPORT_LABELS,
  ACTIVITY_SPORTS,
  isActivitySport,
  type ActivitySport,
} from "@/domain/activity";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireUser } from "@/server/auth";
import { getActiveSession } from "@/server/queries/active-session";
import { getRequestProfile } from "@/server/queries/request-profile";
import { listTemplates } from "@/server/repositories/activity-templates";
import { standaloneSchedule } from "@/server/repositories/occurrences";
import { getSchedule } from "@/server/repositories/schedule";

export const metadata: Metadata = { title: "Training" };

/**
 * Where training is entered and managed (plan §2.3).
 *
 * Not a second history and not a second Today. This is where you come to log something,
 * schedule something, open the programme or pick up work you left unfinished. What actually
 * happened lives in History; what is scheduled for today lives on Today.
 */
export default async function TrainingPage(props: PageProps<"/training">) {
  const search = await props.searchParams;
  const requested = typeof search.sport === "string" ? search.sport : null;
  // An unknown sport filter is refused rather than quietly ignored (AT-NAV-06).
  if (requested && !isActivitySport(requested)) notFound();
  const filter: ActivitySport | null = requested && isActivitySport(requested) ? requested : null;

  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const today = todayInTimeZone(profile.timeZone);
  const [inProgress, data] = await Promise.all([
    getActiveSession(user.id),
    withUser(
      getDb(),
      user.id,
      async (tx) => ({
        schedule: await getSchedule(tx, user.id),
        templates: await listTemplates(tx, user.id, { sport: filterEndurance(filter) }),
        standalone: await standaloneSchedule(tx, user.id, today),
      }),
      { readOnly: true },
    ),
  ]);
  const upcoming = data.standalone.upcoming.length;
  const earlier = data.standalone.earlier.filter(
    (occurrence) => occurrence.resolution.kind === "incomplete",
  ).length;

  return (
    <>
      <PageHeader title="Training" meta={filter ? ACTIVITY_SPORT_LABELS[filter] : undefined} />
      <PageContent>
        <Section title="Sport">
          <SegmentedLinks
            label="Sport"
            options={[
              { href: "/training", label: "All", current: filter === null },
              ...ACTIVITY_SPORTS.map((sport) => ({
                href: `/training?sport=${sport}`,
                label: ACTIVITY_SPORT_LABELS[sport],
                current: filter === sport,
              })),
            ]}
          />
        </Section>

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

        <Section title="Log or schedule">
          <Card>
            <LinkButton
              href={
                filter && filter !== "strength" ? `/training/new?sport=${filter}` : "/training/new"
              }
              className="w-full"
            >
              Log an activity
            </LinkButton>
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
            <LinkButton href="/training/scheduled" variant="ghost" className="w-full">
              Upcoming and earlier
            </LinkButton>
          </Card>
        </Section>

        <Section title="Programme">
          <Card>
            <p className="text-sm text-ink-muted">
              {data.schedule
                ? data.schedule.program.name
                : "No active programme. One can hold several weeks across every sport you train."}
            </p>
            <LinkButton href="/training/programme" variant="secondary" className="w-full">
              {data.schedule ? "Open the programme" : "Create a programme"}
            </LinkButton>
          </Card>
        </Section>

        <Section title="Templates">
          <Card>
            <p className="text-sm text-ink-muted tabular-nums">
              {data.templates.length} saved session
              {data.templates.length === 1 ? "" : "s"}
            </p>
            <LinkButton href="/training/templates" variant="ghost" className="w-full">
              Templates
            </LinkButton>
          </Card>
        </Section>
      </PageContent>
    </>
  );
}

/** Templates are endurance-only; a strength filter simply has none of its own here. */
function filterEndurance(sport: ActivitySport | null) {
  return sport && sport !== "strength" ? sport : undefined;
}
