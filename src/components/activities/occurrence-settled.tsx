import type { Route } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarDays } from "@/components/ui/icons";
import type { ActivitySport } from "@/domain/activity";
import type { ProgrammeClosure, ScheduledOccurrence } from "@/server/repositories/occurrences";
import { formatIsoDate } from "@/lib/format";

import { programmeClosureLine, showsClosure } from "./programme-closure";

/**
 * A scheduled session that cannot be logged again, and why.
 *
 * Refusing is right — one occurrence is answered once — but "that page or item does not
 * exist, or it belongs to a different account" is untrue of a session this account owns and
 * has already done. It says what became of it, and offers the thing they probably wanted:
 * what they logged, or the programme the cancelled session came from. One left owed or skipped
 * by a programme the athlete has moved on from says how that programme ended (`closure`, ADR
 * 0054), and offers the sport on its own.
 */
const SPORT_NOUNS: Record<ActivitySport, string> = {
  strength: "session",
  running: "run",
  cycling: "ride",
  swimming: "swim",
};

export function OccurrenceSettled({
  occurrence,
  closure = null,
}: {
  occurrence: ScheduledOccurrence;
  /** How its programme stopped being the athlete's, when it has. */
  closure?: ProgrammeClosure | null;
}) {
  const noun = SPORT_NOUNS[occurrence.sport];
  const when = formatIsoDate(occurrence.scheduledOn);
  const settled =
    occurrence.resolution.kind === "logged"
      ? {
          header: "Already done",
          title: "You have already logged this",
          description: `The ${noun} scheduled for ${when} was answered by an activity you logged. A scheduled session is logged once; correct that activity rather than logging a second one.`,
          href: `/training/activities/${occurrence.resolution.activityId}` as Route,
          label: "See what you logged",
        }
      : occurrence.resolution.kind === "cancelled"
        ? {
            header: "Already done",
            title: "This session was cancelled",
            description: `The ${noun} scheduled for ${when} was removed from your programme, so there is nothing to log against it. You can still log a ${noun} on its own.`,
            href: `/training/new?sport=${occurrence.sport}` as Route,
            label: `Log a ${noun} anyway`,
          }
        : showsClosure(occurrence)
          ? {
              // Owed or skipped, so nothing was done about it, and it is not said to be: it is
              // named for what it is. One completed before the record was kept is settled.
              header: "Scheduled session",
              title:
                closure && closure.followedBy === null
                  ? "Its programme was archived"
                  : "Its programme has ended",
              description: `${programmeClosureLine(closure)}, so the ${noun} scheduled for ${when} can no longer be logged. You can still log a ${noun} on its own.`,
              href: `/training/new?sport=${occurrence.sport}` as Route,
              label: `Log a ${noun} anyway`,
            }
          : {
              header: "Already done",
              title: "This session is already settled",
              description: `The ${noun} scheduled for ${when} is no longer waiting to be logged.`,
              href: "/training" as Route,
              label: "Go to Training",
            };
  return (
    <>
      <PageHeader title={settled.header} backHref="/training" />
      <PageContent>
        <EmptyState
          icon={CalendarDays}
          title={settled.title}
          description={settled.description}
          action={
            <LinkButton href={settled.href} variant="secondary">
              {settled.label}
            </LinkButton>
          }
        />
      </PageContent>
    </>
  );
}
