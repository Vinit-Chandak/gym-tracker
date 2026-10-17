import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProgrammeTools } from "@/components/coaching/programme-tools";
import { ProgrammeWeekPicker } from "@/components/coaching/programme-week-picker";
import { PageHeader } from "@/components/shell/page-header";
import { PageContent } from "@/components/shell/page-content";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Section } from "@/components/ui/section";
import { NavRow } from "@/components/ui/nav-row";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORT_LABELS, isActivitySport } from "@/domain/activity";
import { describePrescription } from "@/domain/activity-prescription";
import { addDays, todayInTimeZone } from "@/domain/program-calendar";
import { formatIsoDate } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getActiveProgram } from "@/server/repositories/schedule";
import { programmeOccurrences } from "@/server/repositories/occurrences";
import { listProgramDrafts } from "@/server/repositories/program-drafts";
import { readSportUnits } from "@/server/repositories/sport-preferences";
import StrengthProgrammePage from "@/app/(app)/profile/programme/page";
import { RequestReview } from "@/app/(app)/profile/programme/request-review";
import { athleteReviewStatus } from "@/server/repositories/coaching-jobs";
import { canRunCoachJobs, isCoachServiceConfigured } from "@/lib/env";
import {
  currentProgrammeWeek,
  selectedProgrammeWeek,
  sessionsInProgrammeWeek,
} from "./programme-weeks";

export const metadata: Metadata = { title: "Programme" };
export default async function SportProgrammePage({
  params,
  searchParams,
}: {
  params: Promise<{ sport: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { sport } = await params;
  if (!isActivitySport(sport)) notFound();
  if (sport === "strength")
    return StrengthProgrammePage({ params: Promise.resolve({}), searchParams });
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const today = todayInTimeZone(profile.timeZone);
  const search = await searchParams;
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
  const weeks = data.programme?.weeks ?? 1;
  const currentWeek = currentProgrammeWeek(data.programme?.startDate ?? null, weeks, today);
  const week = selectedProgrammeWeek(search.week, currentWeek, weeks);
  const sessions = sessionsInProgrammeWeek(
    data.sessions,
    data.programme?.startDate ?? null,
    weeks,
    week,
  );
  const total = data.sessions.filter((session) => session.resolution.kind !== "cancelled").length;
  const completed = data.sessions.filter(
    (session) =>
      session.resolution.kind === "logged" || session.resolution.kind === "legacy_completed",
  ).length;
  const finished =
    data.sessions.length > 0 &&
    data.sessions.every((session) => session.resolution.kind !== "incomplete");
  const weekStart = data.programme?.startDate
    ? addDays(data.programme.startDate, (week - 1) * 7)
    : null;
  const coachOffered = profile.aiCoachEnabled && canRunCoachJobs() && isCoachServiceConfigured();
  return (
    <>
      <PageHeader title={`${ACTIVITY_SPORT_LABELS[sport]} programme`} backHref="/training" />
      <PageContent>
        {data.programme ? (
          <>
            <Card>
              <h2 className="text-xl font-medium [overflow-wrap:break-word]">
                {data.programme.name}
              </h2>
              <p className="text-sm text-ink-2">{weeks} weeks · Scheduled by date</p>
              <ProgressBar
                value={completed}
                max={total || 1}
                label={`${completed} of ${total} sessions complete`}
              />
              <ProgrammeTools id={data.programme.id} sport={sport} finished={finished} />
              {(data.programme.notes || data.programme.splitFromProgramId) && (
                <Disclosure summary="Programme details" variant="footer">
                  <div className="space-y-3 text-sm">
                    {data.programme.notes && (
                      <p className="[overflow-wrap:break-word] whitespace-pre-wrap">
                        {data.programme.notes}
                      </p>
                    )}
                    {data.programme.splitFromProgramId && (
                      <p className="text-ink-2">
                        Separated from your previous combined plan. Your lifting progress and
                        completed sessions are preserved.
                      </p>
                    )}
                  </div>
                </Disclosure>
              )}
            </Card>
            {data.drafts.length > 0 && (
              <Section title="Ready to continue">
                <ul>
                  {data.drafts.map((draft) => (
                    <NavRow
                      key={draft.id}
                      href={
                        draft.status === "editing"
                          ? `/training/programmes/${sport}/edit?draft=${draft.id}`
                          : `/profile/programme/drafts/${draft.id}`
                      }
                      glyph="note"
                      label={draft.headline || draft.blueprint.name}
                      sub={
                        draft.status === "editing"
                          ? "Continue editing your draft"
                          : "Review before applying"
                      }
                    />
                  ))}
                </ul>
              </Section>
            )}
            <Section
              title="Your schedule"
              description="Browse one week at a time. Open a session for its targets, to log it or to move its date."
            >
              <ProgrammeWeekPicker
                sport={sport}
                week={week}
                weeks={weeks}
                currentWeek={currentWeek}
              />
              {weekStart && (
                <p className="text-sm text-ink-2">
                  {formatIsoDate(weekStart, today.slice(0, 4))} –{" "}
                  {formatIsoDate(addDays(weekStart, 6), today.slice(0, 4))}
                </p>
              )}
              <ul className="ruled-list">
                {sessions.map((session) => (
                  <NavRow
                    key={session.id}
                    href={`/training/programme/occurrences/${session.id}`}
                    glyph="calendar"
                    label={session.prescription?.title ?? `${ACTIVITY_SPORT_LABELS[sport]} session`}
                    sub={`${formatIsoDate(session.scheduledOn, today.slice(0, 4))}${session.prescription ? ` · ${describePrescription(session.prescription, data.units)}` : ""}`}
                    badge={
                      session.resolution.kind === "logged" ||
                      session.resolution.kind === "legacy_completed"
                        ? "Done"
                        : session.resolution.kind === "skipped"
                          ? "Skipped"
                          : session.resolution.kind === "cancelled"
                            ? "Cancelled"
                            : session.scheduledOn < today
                              ? "Not logged"
                              : session.scheduledOn === today
                                ? "Today"
                                : undefined
                    }
                  />
                ))}
              </ul>
              {sessions.length === 0 && (
                <p className="py-4 text-sm text-ink-2">No sessions in this week.</p>
              )}
            </Section>
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
          </>
        ) : (
          <LinkButton href={`/training/programmes/new?sport=${sport}`}>
            Create a programme
          </LinkButton>
        )}
      </PageContent>
    </>
  );
}
