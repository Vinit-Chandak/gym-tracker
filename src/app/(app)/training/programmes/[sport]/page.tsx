import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProgrammeTools } from "@/components/coaching/programme-tools";
import { PageHeader } from "@/components/shell/page-header";
import { PageContent } from "@/components/shell/page-content";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NavRow } from "@/components/ui/nav-row";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORT_LABELS, isActivitySport } from "@/domain/activity";
import { describePrescription } from "@/domain/activity-prescription";
import { todayInTimeZone } from "@/domain/program-calendar";
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
  const data = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const programme = await getActiveProgram(tx, user.id, sport);
      return {
        programme,
        sessions: programme ? await programmeOccurrences(tx, user.id, programme.familyId) : [],
        drafts: (await listProgramDrafts(tx, user.id)).filter(
          (draft) => draft.sport === sport && !draft.standalone,
        ),
        units: await readSportUnits(tx, user.id),
        review: await athleteReviewStatus(tx, user.id, new Date(), sport),
      };
    },
    { readOnly: true },
  );
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
              <p className="text-sm text-ink-2">Calendar dates · {data.programme.weeks} weeks</p>
              {data.programme.notes && (
                <p className="text-sm whitespace-pre-wrap">{data.programme.notes}</p>
              )}
              <ProgrammeTools id={data.programme.id} />
            </Card>
            {data.programme.splitFromProgramId && (
              <p className="text-sm text-ink-2">
                Separated from your previous combined plan. Your lifting progress and completed
                sessions are preserved. Ask the coach to revise the future schedule for review.
              </p>
            )}
            <RequestReview
              sport={sport}
              availability={{
                offered: profile.aiCoachEnabled && canRunCoachJobs() && isCoachServiceConfigured(),
                canAsk: data.review.canAsk,
                running: data.review.running,
                waiting: data.review.waiting,
                nextOn: data.review.nextAt
                  ? todayInTimeZone(profile.timeZone, data.review.nextAt)
                  : null,
              }}
            />
            {data.drafts.length > 0 && (
              <section>
                <h2 className="caption-head">Proposed changes</h2>
                <ul>
                  {data.drafts.map((draft) => (
                    <NavRow
                      key={draft.id}
                      href={`/profile/programme/drafts/${draft.id}`}
                      glyph="note"
                      label={draft.headline || draft.blueprint.name}
                      sub="Review before applying"
                    />
                  ))}
                </ul>
              </section>
            )}
            <section>
              <h2 className="caption-head">Sessions</h2>
              <ul className="ruled-list">
                {data.sessions.map((session) => (
                  <NavRow
                    key={session.id}
                    href={`/training/programme/occurrences/${session.id}`}
                    glyph="calendar"
                    label={session.prescription?.title ?? `${ACTIVITY_SPORT_LABELS[sport]} session`}
                    sub={`${session.scheduledOn}${session.prescription ? ` · ${describePrescription(session.prescription, data.units)}` : ""}`}
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
            </section>
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
