import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";

import { enduranceName } from "@/components/activities/endurance-line";
import { ProgrammeTools } from "@/components/coaching/programme-tools";
import { RequestChange } from "@/components/coaching/request-change";
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
import { describePrescription } from "@/domain/activity-prescription";
import { plannedVolume, plannedVolumeLine } from "@/domain/planned-volume";
import { endurancePattern } from "@/domain/programme-pattern";
import { RUN_TYPE_LABELS } from "@/domain/run-types";
import { todayInTimeZone } from "@/domain/program-calendar";
import { holdHyphens, joinFacts, readsAs } from "@/lib/facts";
import { formatIsoDate } from "@/lib/format";
import { canRunCoachJobs, isCoachServiceConfigured } from "@/lib/env";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { athleteReviewStatus } from "@/server/repositories/coaching-jobs";
import { programmeOccurrences, type ProgrammeOccurrence } from "@/server/repositories/occurrences";
import { listProgramDrafts } from "@/server/repositories/program-drafts";
import { getActiveProgram } from "@/server/repositories/schedule";
import { readSportUnits } from "@/server/repositories/sport-preferences";
import { RequestReview } from "@/app/(app)/profile/programme/request-review";

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
 * are, then its weeks. The weeks say what each asks for without dates, which are Plan's week:
 * a session opens to move, skip or change it. Strength has its own page, its days in order.
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
      const [programme, drafts, units, review] = await Promise.all([
        getActiveProgram(tx, user.id, sport),
        listProgramDrafts(tx, user.id),
        readSportUnits(tx, user.id),
        athleteReviewStatus(tx, user.id, new Date(), sport),
      ]);
      return {
        programme,
        sessions: programme ? await programmeOccurrences(tx, user.id, programme.familyId) : [],
        drafts: drafts.filter((draft) => draft.sport === sport && !draft.standalone),
        units,
        review,
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
  const coachOffered = profile.aiCoachEnabled && canRunCoachJobs() && isCoachServiceConfigured();
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
            value={done}
            max={asked.length || 1}
            label={`${done} of ${asked.length} sessions done`}
          />
          <ProgrammeTools id={programme.id} sport={sport} finished={finished} />
          {(programme.notes || programme.splitFromProgramId) && (
            <Disclosure summary="Programme details" variant="footer">
              <div className="space-y-3 text-sm">
                {programme.notes && (
                  <p className="[overflow-wrap:break-word] whitespace-pre-wrap">
                    {programme.notes}
                  </p>
                )}
                {programme.splitFromProgramId && (
                  <p className="text-ink-2">
                    Separated from your previous combined plan. Your lifting progress and completed
                    sessions are preserved.
                  </p>
                )}
              </div>
            </Disclosure>
          )}
        </Card>
        {data.drafts.length > 0 && (
          <Section title="Changes">
            <ul>
              {data.drafts.map((draft) => (
                <NavRow
                  key={draft.id}
                  href={
                    (draft.status === "editing"
                      ? `/plan/${sport}/edit?draft=${draft.id}`
                      : `/profile/programme/drafts/${draft.id}`) as Route
                  }
                  glyph="note"
                  label={draft.headline || draft.blueprint.name}
                  sub={draft.status === "editing" ? "Draft in progress" : "Changes to review"}
                />
              ))}
            </ul>
          </Section>
        )}
        <Section title="Weeks">
          <ul className="space-y-3">
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
                      week === currentWeek && !finished
                        ? // A block the athlete has not reached yet starts on its day, not now.
                          start && today < start
                          ? `Starts ${formatIsoDate(start, today.slice(0, 4))}`
                          : "Now"
                        : allDone
                          ? "Done"
                          : missed > 0 && `${missed} missed`,
                    ])}
                    defaultOpen={week === currentWeek && !finished}
                  >
                    <ul className="ruled-list">
                      {inWeek.map((session) => {
                        const type = session.prescription?.running?.sessionType;
                        const name =
                          session.prescription?.title ??
                          (type ? RUN_TYPE_LABELS[type] : enduranceName(sport));
                        return (
                          <NavRow
                            key={session.id}
                            href={`/training/programme/occurrences/${session.id}` as Route}
                            label={holdHyphens(name)}
                            sub={
                              session.prescription
                                ? joinFacts([
                                    type && name !== RUN_TYPE_LABELS[type] && RUN_TYPE_LABELS[type],
                                    // Said once where the name already says it ("6 × 800 m").
                                    !readsAs(
                                      name,
                                      describePrescription(session.prescription, data.units),
                                    ) && describePrescription(session.prescription, data.units),
                                  ])
                                : undefined
                            }
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
        {changeOffered && <RequestChange sport={sport} noteId={crypto.randomUUID()} />}
        {coachOffered && (
          <Disclosure
            summary="Coach review"
            defaultOpen={data.review.running || Boolean(data.review.waiting)}
          >
            <RequestReview
              sport={sport}
              availability={{
                offered: true,
                canAsk: data.review.canAsk,
                running: data.review.running,
                waiting: data.review.waiting,
                nextOn: data.review.nextAt
                  ? todayInTimeZone(profile.timeZone, data.review.nextAt)
                  : null,
              }}
            />
          </Disclosure>
        )}
      </PageContent>
    </>
  );
}
