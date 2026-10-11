import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Figures } from "@/components/ui/figures";
import { CalendarDays } from "@/components/ui/icons";
import { LinkRow, List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORT_LABELS, isActivitySport, type ActivitySport } from "@/domain/activity";
import { describePrescription } from "@/domain/activity-prescription";
import { todayInTimeZone } from "@/domain/program-calendar";
import type { SessionStanding, SportAdherence } from "@/domain/programme-sessions";
import type { SportUnits } from "@/lib/distance-units";
import { joinFacts } from "@/lib/facts";
import { formatIsoDate } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { programmeOccurrences } from "@/server/repositories/occurrences";
import { getSchedule } from "@/server/repositories/schedule";
import { unitsBySport } from "@/server/repositories/sport-preferences";

import { programmeView, type ProgrammeRow } from "./programme-view";

export const metadata: Metadata = { title: "Programme" };

/** What a row says of where it stands. A session further along the sequence says nothing. */
const STANDING: Record<SessionStanding, { label: string; tone: "accent" | "neutral" } | null> = {
  next: { label: "Next", tone: "accent" },
  to_come: null,
  not_done: { label: "Not done", tone: "neutral" },
  logged: { label: "Logged", tone: "accent" },
  skipped: { label: "Skipped", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  legacy_completed: { label: "Completed earlier", tone: "neutral" },
};

/** How a sport's sessions are called when there are none: "No runs in this programme". */
const PLURAL: Record<ActivitySport, string> = {
  strength: "workouts",
  running: "runs",
  cycling: "rides",
  swimming: "swims",
};

/** "Running · 25 done · 5 skipped · 0 to come", with the rarer counts only when there are any. */
function adherenceLine(counts: SportAdherence): string {
  const label = counts.sport === "strength" ? "Lifting" : ACTIVITY_SPORT_LABELS[counts.sport];
  // Each count kept with its words, and each dot with the count after it, when it wraps.
  return joinFacts([
    label,
    `${counts.done}\u00a0done`,
    `${counts.skipped}\u00a0skipped`,
    `${counts.toCome}\u00a0to\u00a0come`,
    counts.notDone > 0 && `${counts.notDone}\u00a0not\u00a0done`,
    counts.cancelled > 0 && `${counts.cancelled}\u00a0cancelled`,
  ]);
}

/**
 * One session: its programme day, what it asks for, and where it stands.
 *
 * The date is where the block put it, and says so: "planned for Thu 1 Oct". The sequence waits
 * (ADR 0051), so a run still to come is not due on it, and a bare date beside a projected end
 * read as a schedule ten days stale. One logged on another day says the day it was logged, so a
 * run done a fortnight late is not read as done on its date (year audit, October 2026). The
 * cycle and the date stand on a line of their own in every row, however short they are.
 */
function SessionRow({ row, units, year }: { row: ProgrammeRow; units: SportUnits; year: string }) {
  const { occurrence, standing, dayName } = row;
  const sport = ACTIVITY_SPORT_LABELS[occurrence.sport];
  const status = STANDING[standing];
  const resolution = occurrence.resolution;
  const loggedOn =
    resolution.kind === "logged" && resolution.occurredOn !== occurrence.scheduledOn
      ? `logged ${formatIsoDate(resolution.occurredOn, year)}`
      : null;
  return (
    <li>
      <LinkRow
        prefetch="intent"
        href={`/training/programme/occurrences/${occurrence.id}` as Route}
        title={dayName ?? sport}
        badge={status && <Badge tone={status.tone}>{status.label}</Badge>}
        subtitle={[
          sport,
          occurrence.prescription ? describePrescription(occurrence.prescription, units) : null,
          loggedOn,
        ]
          .filter(Boolean)
          .join(" · ")}
        detail={joinFacts([
          occurrence.cycleIndex !== null && `Cycle ${occurrence.cycleIndex}`,
          `planned for ${formatIsoDate(occurrence.scheduledOn, year)}`,
        ])}
      />
    </li>
  );
}

/**
 * The programme, in full (plan §2.3).
 *
 * One place where every session of the block lives, including the ones behind. Earlier
 * incomplete work is here rather than on Today: it can be logged late, skipped or moved from
 * this page, and doing any of those touches that session alone.
 *
 * The programme is a sequence that waits (ADR 0051), so each session is read by where the
 * sequence has got to: what is still to do comes first, Today's at its head, and nothing is
 * called missed because its date went by while the sequence waited for it.
 */
export default async function ProgrammePage(props: PageProps<"/training/programme">) {
  const search = await props.searchParams;
  const requested = typeof search.sport === "string" ? search.sport : null;
  const sportFilter: ActivitySport | null =
    requested && isActivitySport(requested) ? requested : null;
  if (requested && !sportFilter) notFound();

  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const today = todayInTimeZone(profile.timeZone);
  const data = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const schedule = await getSchedule(tx, user.id);
      if (!schedule) return { schedule: null, occurrences: [] };
      return {
        schedule,
        occurrences: await programmeOccurrences(tx, user.id, schedule.program.familyId, {
          sport: sportFilter ?? undefined,
        }),
        units: await unitsBySport(tx, user.id),
      };
    },
    { readOnly: true },
  );

  if (!data.schedule) {
    return (
      <>
        <PageHeader title="Programme" backHref="/training" />
        <PageContent>
          <EmptyState
            icon={CalendarDays}
            title="No active programme"
            description="A programme keeps several weeks of training in one place, across every sport you train."
            action={
              <LinkButton href="/profile/programme/create" variant="secondary">
                Create a programme
              </LinkButton>
            }
          />
        </PageContent>
      </>
    );
  }

  const units = data.units;
  const year = today.slice(0, 4);
  const view = programmeView({
    state: data.schedule.state,
    days: data.schedule.days,
    occurrences: data.occurrences,
    today,
    sport: sportFilter,
  });
  const rows = (list: readonly ProgrammeRow[]) => (
    <List>
      {list.map((row) => (
        <SessionRow
          key={row.occurrence.id}
          row={row}
          units={units[row.occurrence.sport]}
          year={year}
        />
      ))}
    </List>
  );
  const lifts = data.schedule.days.some((day) => day.includesLifting);
  // Narrowed to one endurance sport, from a day's "View planned runs".
  const narrowed = sportFilter && sportFilter !== "strength" ? sportFilter : null;

  return (
    <>
      <PageHeader title="Programme" meta={data.schedule.program.name} backHref="/training" />
      <PageContent>
        {view.adherence.length > 0 && (
          <Section title="Adherence">
            <Card>
              {view.adherence.map((counts) => (
                <p key={counts.sport} className="text-sm tabular-nums">
                  {/* Its counts in Jost, whose zero is plain: "0 skipped", not a slashed one. */}
                  <Figures>{adherenceLine(counts)}</Figures>
                </p>
              ))}
              {/* Each sport's record is its own: an unfinished run cannot fail a finished lift. */}
              {view.adherence.length > 1 && (
                <p className="text-sm text-ink-muted">
                  Each sport is counted on its own, so a day that lifts and runs counts in both.
                </p>
              )}
            </Card>
          </Section>
        )}

        {/* Titled by what they hold, "Runs to come": the lifting the adherence counts is not
            listed, its days being the cycle, on Training. */}
        {view.ahead.length > 0 && (
          <Section
            title={view.titles.ahead}
            description={
              view.ahead.some((row) => row.occurrence.scheduledOn < today)
                ? "The programme waits for you, so a session planned for a day gone by is still to do."
                : undefined
            }
          >
            {rows(view.ahead)}
          </Section>
        )}
        {view.notDone.length > 0 && (
          <Section title={view.titles.notDone}>{rows(view.notDone)}</Section>
        )}
        {view.earlier.length > 0 && (
          <Section title={view.titles.earlier}>{rows(view.earlier)}</Section>
        )}

        {/* Lifting has no sessions to list: its days are the cycle, on Training (plan §2.3). */}
        {data.occurrences.length === 0 && (
          <EmptyState
            icon={CalendarDays}
            title={
              narrowed
                ? `No ${PLURAL[narrowed]} in this programme`
                : "No runs, rides or swims in this programme"
            }
            description={
              lifts
                ? "Its lifting days are on Training, a cycle at a time."
                : "The sessions it schedules appear here, one by one."
            }
            action={
              narrowed ? (
                <LinkButton href="/training/programme" variant="secondary">
                  See the whole programme
                </LinkButton>
              ) : (
                // The way to what it names, rather than a page name to go and find.
                lifts && (
                  <LinkButton href="/training" variant="secondary">
                    See its days on Training
                  </LinkButton>
                )
              )
            }
          />
        )}
      </PageContent>
    </>
  );
}
