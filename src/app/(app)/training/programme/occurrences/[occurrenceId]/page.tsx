import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ActivityPlan } from "@/components/activities/activity-plan";
import { OccurrenceActions } from "@/components/activities/occurrence-actions";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { HeroCard } from "@/components/ui/hero-card";
import { InfoTip } from "@/components/ui/info-tip";
import { SPORT_ICON } from "@/components/ui/sport-chip";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORT_LABELS } from "@/domain/activity";
import { describePrescription } from "@/domain/activity-prescription";
import { isOverdue } from "@/domain/occurrences";
import { todayInTimeZone } from "@/domain/program-calendar";
import { formatIsoDate, formatIsoWeekdayDay } from "@/lib/format";
import { SPORT_TONE } from "@/lib/sport-tone";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { activePlanForOccurrence } from "@/server/repositories/coach-plans";
import { getOccurrence } from "@/server/repositories/occurrences";
import { requireUuid } from "@/server/validation/params";

export const metadata: Metadata = { title: "Scheduled session" };

/**
 * One scheduled session: what it asks for, what became of it, and what can be done about it
 * (plan §7). Logging, skipping and moving all act on this session and no other.
 */
export default async function OccurrencePage(
  props: PageProps<"/training/programme/occurrences/[occurrenceId]">,
) {
  const { occurrenceId } = await props.params;
  requireUuid(occurrenceId);
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const { occurrence, plan } = await withUser(
    getDb(),
    user.id,
    async (tx) => ({
      occurrence: await getOccurrence(tx, user.id, occurrenceId),
      plan: await activePlanForOccurrence(tx, user.id, occurrenceId),
    }),
    { readOnly: true },
  );
  if (!occurrence) notFound();
  const today = todayInTimeZone(profile.timeZone);
  const late = isOverdue(occurrence, occurrence.resolution, today);
  // The preparation is only this session's if it was written against the revision in force;
  // a plan pinned to an older one describes a target the programme has since changed (§8.4).
  const prepared =
    plan && plan.occurrenceRevisionId === occurrence.revisionId
      ? (plan.endurance[0] ?? null)
      : null;
  // One target on the page: the coach's, when it prepared this session inside the approved
  // range, and the programme's otherwise. The two used to be printed one above the other.
  const target = prepared?.prescription ?? occurrence.prescription;
  const Icon = SPORT_ICON[occurrence.sport];
  const time = occurrence.scheduledLocalTime?.slice(0, 5) ?? null;
  const resolution = occurrence.resolution;
  const moved =
    occurrence.originalScheduledOn && occurrence.originalScheduledOn !== occurrence.scheduledOn
      ? occurrence.originalScheduledOn
      : null;

  const badge =
    resolution.kind === "logged" ? (
      <Badge tone="success">Logged</Badge>
    ) : resolution.kind === "skipped" ? (
      <Badge tone="neutral">Skipped</Badge>
    ) : resolution.kind === "cancelled" ? (
      <Badge tone="neutral">Cancelled</Badge>
    ) : resolution.kind === "legacy_completed" ? (
      <Badge tone="neutral">Completed earlier</Badge>
    ) : late ? (
      <Badge tone="neutral">Not done</Badge>
    ) : null;

  return (
    <>
      <PageHeader
        title={ACTIVITY_SPORT_LABELS[occurrence.sport]}
        meta={formatIsoDate(occurrence.scheduledOn)}
        backHref="/training/programme"
      />
      <PageContent>
        {/* The session itself, in its sport's colour: what it asks for, and the one thing to
            do about it. */}
        <HeroCard tone={SPORT_TONE[occurrence.sport]}>
          <div className="flex items-start justify-between gap-3">
            <p className="flex min-h-7 min-w-0 items-center gap-2 text-sm font-semibold text-ink-muted tabular-nums">
              <Icon aria-hidden />
              {formatIsoWeekdayDay(occurrence.scheduledOn)}
              {time ? `, ${time}` : ""}
            </p>
            {badge}
          </div>
          <div>
            <h2 className="font-display text-display-l font-extrabold [overflow-wrap:anywhere]">
              {target ? describePrescription(target) : "No targets set"}
            </h2>
            {moved && (
              // The tip's target is taller than the line, so it gives the height back.
              <p className="mt-2 flex items-center gap-1 text-callout text-ink-muted">
                <span>Moved from {formatIsoWeekdayDay(moved)}.</span>
                <InfoTip label="About moving a session" className="-my-2">
                  Adherence still counts against the week it was first placed in.
                </InfoTip>
              </p>
            )}
          </div>

          {resolution.kind === "logged" ? (
            <>
              <p className="text-callout text-ink-muted">
                Logged on {formatIsoDate(resolution.occurredOn)}.
              </p>
              <LinkButton
                href={`/training/activities/${resolution.activityId}`}
                size="lg"
                className="w-full"
              >
                See what you logged
              </LinkButton>
            </>
          ) : resolution.kind === "legacy_completed" ? (
            <p className="text-callout text-ink-muted">
              Completed before this was recorded in full. There is no activity behind it, and none
              was invented.
            </p>
          ) : (
            occurrence.loggable && (
              <LinkButton
                href={`/training/new?occurrence=${occurrence.id}`}
                size="lg"
                className="w-full"
              >
                Log it
              </LinkButton>
            )
          )}
        </HeroCard>

        {resolution.kind !== "logged" && (
          <ActivityPlan
            prescription={target}
            preparation={prepared ? { summary: prepared.summary, note: prepared.note } : null}
            preparedByCoach={prepared !== null}
            fromProgramme={occurrence.familyId !== null}
          />
        )}

        {resolution.kind !== "logged" && resolution.kind !== "legacy_completed" && (
          <OccurrenceActions
            occurrenceId={occurrence.id}
            skipped={occurrence.disposition === "skipped"}
            scheduledOn={occurrence.scheduledOn}
          />
        )}
      </PageContent>
    </>
  );
}
