import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";

import { enduranceTarget, plannedName } from "@/components/activities/endurance-line";
import { alreadySays } from "@/components/activities/prescription-lines";
import { ProgrammeTools } from "@/components/coaching/programme-tools";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { NavRow } from "@/components/ui/nav-row";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORT_LABELS, isActivitySport, type EnduranceSport } from "@/domain/activity";
import { plannedVolume, plannedVolumeLine } from "@/domain/planned-volume";
import { endurancePattern } from "@/domain/programme-pattern";
import { RUN_TYPE_LABELS } from "@/domain/run-types";
import { addDays, todayInTimeZone } from "@/domain/program-calendar";
import { holdHyphens, joinFacts } from "@/lib/facts";
import { formatIsoShortDay } from "@/lib/format";
import { isCoachServiceConfigured } from "@/lib/env";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { programmeOccurrences, type ProgrammeOccurrence } from "@/server/repositories/occurrences";
import { getActiveProgram } from "@/server/repositories/schedule";
import { readSportUnits } from "@/server/repositories/sport-preferences";
import { endurancePosition } from "@/server/repositories/sport-programmes";
import {
  loadProgrammeChanges,
  ProgrammeCoach,
  ProgrammeWaiting,
} from "@/app/(app)/profile/programme/changes";

import { currentProgrammeWeek, sessionsInProgrammeWeek } from "./programme-weeks";
import { StrengthProgramme } from "./strength-programme";

export const metadata: Metadata = { title: "Programme" };

/** "3 runs", "1 ride", "4 swims": how much a week asks for, in the sport's own word. */
function sessionCount(sport: EnduranceSport, count: number): string {
  const noun = { running: "run", cycling: "ride", swimming: "swim" }[sport];
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** What became of a session, in the app's three words; nothing for one still to come. */
function sessionStatus(session: ProgrammeOccurrence, today: string): string | undefined {
  switch (session.resolution.kind) {
    case "logged":
    case "legacy_completed":
      return "Done";
    case "skipped":
      return "Skipped";
    default:
      return session.scheduledOn < today ? "Missed" : undefined;
  }
}

/**
 * A run, ride or swim programme (ADR 0058): what it is, how it runs and how far through it you
 * are, what waits for you from the coach, then its weeks. Each week says what it asks for and the
 * day it starts, which orients the list (PRODUCT.md, Information map); a session's own date is
 * Plan's week's and its page's, where it opens to move, skip or change it. Under the weeks, the
 * rest of its dealings with the coach, as the strength programme's Changes holds them: what is
 * with the coach, what it changed on its own, asking for a change or a review, and the way to
 * its past requests and changes. Strength has its own page, its days in order.
 */
export default async function SportProgrammePage({
  params,
  searchParams,
}: {
  params: Promise<{ sport: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { sport } = await params;
  if (!isActivitySport(sport)) notFound();
  if (sport === "strength") return <StrengthProgramme searchParams={searchParams} />;
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const today = todayInTimeZone(profile.timeZone);
  const data = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const [programme, units, changes] = await Promise.all([
        getActiveProgram(tx, user.id, sport),
        readSportUnits(tx, user.id),
        loadProgrammeChanges(tx, user.id, profile.timeZone, {
          sport,
          coachOn: profile.aiCoachEnabled,
        }),
      ]);
      return {
        programme,
        sessions: programme ? await programmeOccurrences(tx, user.id, programme.familyId) : [],
        units,
        changes,
      };
    },
    { readOnly: true },
  );
  const label = ACTIVITY_SPORT_LABELS[sport];
  const { programme } = data;
  if (!programme)
    return (
      <>
        <PageHeader title={`${label} programme`} backHref="/plan" />
        <PageContent>
          <Card>
            <h2 className="text-lg font-medium">No {label.toLowerCase()} programme</h2>
            <LinkButton href={`/plan/new?sport=${sport}` as Route}>New programme</LinkButton>
          </Card>
        </PageContent>
      </>
    );
  const weeks = programme.weeks ?? 1;
  const start = programme.startDate ?? null;
  const currentWeek = currentProgrammeWeek(start, weeks, today);
  // A block not reached yet is not under way: the line under the bar says when it starts, and its
  // first week carries that day like every other week, never a second "Starts".
  const waiting = start !== null && today < start;
  const asked = data.sessions.filter((session) => session.resolution.kind !== "cancelled");
  const done = asked.filter(
    (session) =>
      session.resolution.kind === "logged" || session.resolution.kind === "legacy_completed",
  ).length;
  const finished =
    data.sessions.length > 0 &&
    data.sessions.every((session) => session.resolution.kind !== "incomplete");
  const pattern = endurancePattern(
    data.sessions.map((session) => ({
      prescription: session.prescription,
      withdrawn: session.resolution.kind === "cancelled",
    })),
  );
  // A note waits for the coach's next run, so it needs the coach on, not this server to start it.
  const changeOffered =
    profile.aiCoachEnabled &&
    process.env.COACH_WORKFLOW_ENABLED === "true" &&
    isCoachServiceConfigured();
  return (
    <>
      <PageHeader title={`${label} programme`} backHref="/plan" />
      <PageContent>
        <Card>
          <h2 className="text-xl font-medium [overflow-wrap:break-word]">
            {holdHyphens(programme.name)}
          </h2>
          <p className="text-sm text-ink-2">
            {joinFacts([pattern, `${weeks} ${weeks === 1 ? "week" : "weeks"}`])}
          </p>
          <ProgressBar
            sport={sport}
            value={done}
            max={asked.length || 1}
            label={`${done} of ${asked.length} sessions done`}
          />
          {/* Where it has got to in its card's words on Plan, and the bar's figure. */}
          <p className="text-sm text-ink-muted tabular-nums">
            {joinFacts([
              finished ? "Complete" : endurancePosition(start, weeks, today),
              `${done} of ${asked.length} sessions done`,
            ])}
          </p>
          <ProgrammeTools id={programme.id} sport={sport} finished={finished} />
          {programme.notes && (
            <Disclosure summary="Programme details" variant="footer">
              <p className="text-sm [overflow-wrap:break-word] whitespace-pre-wrap">
                {programme.notes}
              </p>
            </Disclosure>
          )}
        </Card>
        {/* The decisions first: what the coach proposed or asked, before the weeks. */}
        <ProgrammeWaiting data={data.changes} />
        <Section title="Weeks">
          {/* Ruled rows that share their rules (DESIGN.md, Folds): never a stack of boxes. */}
          <ul className="[&>li+li]:-mt-px">
            {Array.from({ length: weeks }, (_, index) => index + 1).map((week) => {
              const inWeek = sessionsInProgrammeWeek(asked, start, weeks, week);
              const missed = inWeek.filter(
                (session) =>
                  session.resolution.kind === "incomplete" && session.scheduledOn < today,
              ).length;
              const allDone =
                inWeek.length > 0 &&
                inWeek.every((session) => session.resolution.kind !== "incomplete");
              // What the week adds up to, as a running plan is read (ADR 0059).
              const volume = plannedVolume(inWeek.map((session) => session.prescription));
              return (
                <li key={week}>
                  <Disclosure
                    summary={`Week ${week}`}
                    meta={joinFacts([
                      sessionCount(sport, inWeek.length),
                      plannedVolumeLine(volume, sport, data.units),
                      // The day it starts orients the list (PRODUCT.md, Information map), so a
                      // runner finds Thu 10 Dec.
                      start && formatIsoShortDay(addDays(start, (week - 1) * 7)),
                      week === currentWeek && !finished && !waiting
                        ? "Now"
                        : allDone
                          ? "Done"
                          : missed > 0 && `${missed}\u00a0missed`,
                    ])}
                    variant="inline"
                    defaultOpen={week === currentWeek && !finished}
                  >
                    <ul className="ruled-list">
                      {inWeek.map((session) => {
                        // Named as Today and Plan's week name it (ADR 0059), and under the name
                        // only what it does not already say: "Long run 4.5 mi" over "45 min".
                        const type = session.prescription?.running?.sessionType;
                        const name = plannedName(session.prescription, sport, data.units);
                        const target = enduranceTarget(session.prescription, data.units);
                        const figure = target && `${target.figure}\u00a0${target.unit}`;
                        const kind = type ? RUN_TYPE_LABELS[type] : null;
                        const sub = joinFacts([
                          kind && !alreadySays(name, kind) && kind,
                          figure && !alreadySays(name, figure) && figure,
                        ]);
                        return (
                          <NavRow
                            key={session.id}
                            href={`/plan/sessions/${session.id}` as Route}
                            label={holdHyphens(name)}
                            sub={sub || undefined}
                            value={sessionStatus(session, today)}
                          />
                        );
                      })}
                    </ul>
                    {inWeek.length === 0 && (
                      <p className="py-2 text-sm text-ink-2">Nothing planned.</p>
                    )}
                  </Disclosure>
                </li>
              );
            })}
          </ul>
        </Section>
        <ProgrammeCoach
          data={data.changes}
          request={changeOffered ? { noteId: crypto.randomUUID() } : null}
        />
      </PageContent>
    </>
  );
}
