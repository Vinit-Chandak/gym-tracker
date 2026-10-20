import type { Route } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarDays } from "@/components/ui/icons";
import type { ActivitySport } from "@/domain/activity";
import type { ProgrammeClosure, ScheduledOccurrence } from "@/server/repositories/occurrences";
import { DEFAULT_SPORT_UNITS } from "@/lib/distance-units";
import { joinFacts } from "@/lib/facts";
import { formatIsoDate } from "@/lib/format";
import { originQuery } from "@/lib/nav";

import { plannedName } from "./endurance-line";
import { programmeClosureLine, showsClosure } from "./programme-closure";

/**
 * A scheduled session that cannot be logged again, and why.
 *
 * Refusing is right — one occurrence is answered once — but "it does not exist, or it belongs
 * to another account" is untrue of a session this account owns and has already done. It says
 * what became of it, names the session, and offers the thing they probably wanted: what they
 * logged, or the sport on its own. One left owed or skipped by a programme the athlete has moved
 * on from says how that programme ended (`closure`, ADR 0054). Plan, where the session lives, is
 * the way back, so nothing repeats it as a button.
 */
const SPORT_NOUNS: Record<ActivitySport, string> = {
  strength: "session",
  running: "run",
  cycling: "ride",
  swimming: "swim",
};

/**
 * What became of it, as the screen's title (and the document's): logged, taken off, its
 * programme ended, or done before the record was kept.
 */
export function settledTitle(
  occurrence: ScheduledOccurrence,
  closure: ProgrammeClosure | null = null,
): string {
  if (occurrence.resolution.kind === "logged") return "Already logged";
  if (occurrence.resolution.kind === "cancelled")
    return occurrence.familyId === null ? "Taken off the calendar" : "Removed from your programme";
  // Owed or skipped, so nothing was done about it, and it is not said to be.
  if (showsClosure(occurrence))
    return closure && closure.followedBy === null
      ? "Its programme was archived"
      : "Its programme has ended";
  // Completed before the record was kept.
  return "Already done";
}

export function OccurrenceSettled({
  occurrence,
  closure = null,
}: {
  occurrence: ScheduledOccurrence;
  /** How its programme stopped being the athlete's, when it has. */
  closure?: ProgrammeClosure | null;
}) {
  const noun = SPORT_NOUNS[occurrence.sport];
  // The session, as every screen names it, and the day it was planned for.
  const session = joinFacts([
    plannedName(occurrence.prescription, occurrence.sport, DEFAULT_SPORT_UNITS),
    formatIsoDate(occurrence.scheduledOn),
  ]);
  const action =
    occurrence.resolution.kind === "logged"
      ? {
          // Opened from Plan, whose page this is, it keeps Plan selected (NAV-03).
          href: `/progress/activities/${occurrence.resolution.activityId}${originQuery("plan")}` as Route,
          label: "See what you logged",
        }
      : occurrence.resolution.kind === "cancelled" || showsClosure(occurrence)
        ? {
            href: `/today/log/new?sport=${occurrence.sport}` as Route,
            label: `Log a ${noun} anyway`,
          }
        : null;
  return (
    <>
      <PageHeader title={settledTitle(occurrence, closure)} backHref="/plan" />
      <PageContent>
        <EmptyState
          icon={CalendarDays}
          title={session}
          description={showsClosure(occurrence) ? `${programmeClosureLine(closure)}.` : undefined}
          action={
            action && (
              <LinkButton href={action.href} variant="secondary">
                {action.label}
              </LinkButton>
            )
          }
        />
      </PageContent>
    </>
  );
}
