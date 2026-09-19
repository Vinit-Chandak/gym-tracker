import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ActivityPlan } from "@/components/activities/activity-plan";
import { OccurrenceActions } from "@/components/activities/occurrence-actions";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORT_LABELS } from "@/domain/activity";
import { describePrescription, prescriptionTotals } from "@/domain/activity-prescription";
import { isOverdue } from "@/domain/occurrences";
import { todayInTimeZone } from "@/domain/program-calendar";
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
  const totals = occurrence.prescription ? prescriptionTotals(occurrence.prescription) : null;
  // The preparation is only this session's if it was written against the revision in force;
  // a plan pinned to an older one describes a target the programme has since changed (§8.4).
  const prepared =
    plan && plan.occurrenceRevisionId === occurrence.revisionId
      ? (plan.endurance[0] ?? null)
      : null;

  return (
    <>
      <PageHeader
        title={ACTIVITY_SPORT_LABELS[occurrence.sport]}
        meta={occurrence.scheduledOn}
        backHref="/training/programme"
      />
      <PageContent>
        <Card>
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-medium">
              {occurrence.prescription
                ? describePrescription(occurrence.prescription)
                : "No targets set"}
            </h2>
            {late && <Badge tone="neutral">Not done</Badge>}
          </div>
          {totals && totals.prescribedRestMs > 0 && (
            <p className="text-sm text-ink-muted tabular-nums">
              {totals.prescribedRestMs / 1000} seconds of planned rest between repetitions.
            </p>
          )}
          {occurrence.prescription?.running?.symptomStopRule && (
            <p className="text-sm text-ink-muted">
              Stop if: {occurrence.prescription.running.symptomStopRule}
            </p>
          )}
          {occurrence.originalScheduledOn &&
            occurrence.originalScheduledOn !== occurrence.scheduledOn && (
              <p className="text-sm text-ink-muted">
                Moved from {occurrence.originalScheduledOn}. Adherence still counts against that
                week.
              </p>
            )}
        </Card>

        {occurrence.resolution.kind !== "logged" && (
          <ActivityPlan
            sport={occurrence.sport}
            prescription={prepared?.prescription ?? occurrence.prescription}
            preparation={prepared ? { summary: prepared.summary, note: prepared.note } : null}
            preparedByCoach={prepared !== null}
          />
        )}

        {occurrence.resolution.kind === "logged" ? (
          <Card>
            <p className="text-sm text-ink-muted">Logged on {occurrence.resolution.occurredOn}.</p>
            <Link
              href={`/training/activities/${occurrence.resolution.activityId}`}
              className="text-sm text-accent"
            >
              See what you logged
            </Link>
          </Card>
        ) : occurrence.resolution.kind === "legacy_completed" ? (
          <Card>
            <p className="text-sm text-ink-muted">
              Completed before this was recorded in full. There is no activity behind it, and none
              was invented.
            </p>
          </Card>
        ) : (
          <>
            {occurrence.loggable && (
              <LinkButton href={`/training/new?occurrence=${occurrence.id}`} className="w-full">
                Log it
              </LinkButton>
            )}
            <OccurrenceActions
              occurrenceId={occurrence.id}
              skipped={occurrence.disposition === "skipped"}
              scheduledOn={occurrence.scheduledOn}
            />
          </>
        )}
      </PageContent>
    </>
  );
}
