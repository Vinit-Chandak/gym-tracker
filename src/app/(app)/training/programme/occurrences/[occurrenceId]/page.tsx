import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ActivityPlan } from "@/components/activities/activity-plan";
import { OccurrenceActions } from "@/components/activities/occurrence-actions";
import { SPORT_ICONS } from "@/components/activities/sport-icons";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORT_LABELS } from "@/domain/activity";
import { describePrescription } from "@/domain/activity-prescription";
import { isOverdue } from "@/domain/occurrences";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { activePlanForOccurrence } from "@/server/repositories/coach-plans";
import { getOccurrence } from "@/server/repositories/occurrences";
import { requireUuid } from "@/server/validation/params";
import { formatIsoDate } from "@/lib/format";

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
  const Icon = SPORT_ICONS[occurrence.sport];

  return (
    <>
      <PageHeader
        title={ACTIVITY_SPORT_LABELS[occurrence.sport]}
        meta={formatIsoDate(occurrence.scheduledOn)}
        backHref="/training/programme"
      />
      <PageContent>
        {/* The target is what the session is: the largest thing on the sheet. */}
        <section className="box space-y-3 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <Icon scale="row" className="mt-2 shrink-0 text-ink-muted" aria-hidden />
              <h2
                className={
                  target
                    ? "min-w-0 font-data text-2xl font-semibold [overflow-wrap:anywhere] tabular-nums"
                    : "min-w-0 text-2xl [overflow-wrap:anywhere]"
                }
              >
                {target ? describePrescription(target) : "No targets set"}
              </h2>
            </div>
            {late && <Badge tone="warning">Not done</Badge>}
          </div>
          {occurrence.originalScheduledOn &&
            occurrence.originalScheduledOn !== occurrence.scheduledOn && (
              <p className="text-sm text-ink-muted">
                Moved from {formatIsoDate(occurrence.originalScheduledOn)}. Adherence still counts
                against that week.
              </p>
            )}
        </section>

        {occurrence.resolution.kind !== "logged" && (
          <ActivityPlan
            sport={occurrence.sport}
            prescription={target}
            preparation={prepared ? { summary: prepared.summary, note: prepared.note } : null}
            preparedByCoach={prepared !== null}
          />
        )}

        {occurrence.resolution.kind === "logged" ? (
          <section className="box space-y-2 py-4">
            <p className="text-sm text-ink-muted tabular-nums">
              Logged on {formatIsoDate(occurrence.resolution.occurredOn)}.
            </p>
            <Link
              href={`/training/activities/${occurrence.resolution.activityId}`}
              className="inline-flex min-h-11 items-center text-sm font-medium text-pen"
            >
              See what you logged
            </Link>
          </section>
        ) : occurrence.resolution.kind === "legacy_completed" ? (
          <section className="box py-4">
            <p className="text-sm text-ink-muted">
              Completed before this was recorded in full. There is no activity behind it, and none
              was invented.
            </p>
          </section>
        ) : occurrence.resolution.kind === "cancelled" ? (
          <section className="box py-4">
            <p className="text-sm text-ink-muted">
              This session was removed from the programme. It no longer needs to be logged.
            </p>
          </section>
        ) : (
          <>
            {occurrence.loggable && (
              <LinkButton
                href={`/training/new?occurrence=${occurrence.id}`}
                size="lg"
                className="w-full"
              >
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
