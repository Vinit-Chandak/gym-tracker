import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ActivityEditor } from "@/components/activities/activity-editor";
import { OccurrenceSettled } from "@/components/activities/occurrence-settled";
import { showsClosure } from "@/components/activities/programme-closure";
import { SessionPage } from "@/components/shell/session-page";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { isActivitySport, isEnduranceSport, type EnduranceSport } from "@/domain/activity";
import { describePrescription } from "@/domain/activity-prescription";
import { toDateTimeLocal } from "@/lib/time";
import { saveActivityAction } from "@/server/actions/activities";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getOccurrence, programmeClosure } from "@/server/repositories/occurrences";
import { withPreparedTargets } from "@/server/repositories/coach-plans";
import { unitsFor } from "@/server/repositories/sport-preferences";
import { requireUuid } from "@/server/validation/params";

export const metadata: Metadata = { title: "Log an activity" };

/** One value only. A repeated singleton parameter is a mistake, not a choice to resolve. */
function single(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Logging an activity (plan §3.1).
 *
 * The sport comes from the entry point and is fixed from there. `?occurrence=` logs exactly
 * that scheduled session — never the next unlogged one, never one matched by date — and an
 * occurrence that is missing, foreign, already logged, cancelled or of a programme the athlete
 * has moved on from is refused rather than swapped for something plausible. With no sport at
 * all, this is the chooser.
 */
export default async function NewActivityPage(props: PageProps<"/training/new">) {
  const search = await props.searchParams;

  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const occurrenceId = single(search.occurrence);
  if (search.occurrence !== undefined && !occurrenceId) notFound();
  if (occurrenceId) requireUuid(occurrenceId);
  const { occurrence, closure } = occurrenceId
    ? await withUser(
        getDb(),
        user.id,
        async (tx) => {
          const found = await getOccurrence(tx, user.id, occurrenceId);
          return {
            // Logged against what the coach prepared for today, where it prepared something.
            occurrence: found ? (await withPreparedTargets(tx, user.id, [found]))[0]! : null,
            // How its programme stopped being the athlete's, where it is refused for that
            // (ADR 0054) rather than for having been logged or cancelled.
            closure:
              found && showsClosure(found)
                ? await programmeClosure(tx, user.id, found.familyId, profile.timeZone)
                : null,
          };
        },
        { readOnly: true },
      )
    : { occurrence: null, closure: null };
  // Missing or foreign is genuinely "no such thing". An occurrence this account owns that
  // is already logged, cancelled or closed with its programme is refused too, but saying it
  // does not exist would be a lie about their own session; it is told what became of it.
  if (occurrenceId && !occurrence) notFound();
  if (occurrence && !occurrence.loggable)
    return <OccurrenceSettled occurrence={occurrence} closure={closure} />;

  const requested = single(search.sport);
  if (requested && !(isActivitySport(requested) && isEnduranceSport(requested))) notFound();
  if (requested && occurrence && occurrence.sport !== requested) notFound();

  const sport: EnduranceSport | null = occurrence
    ? (occurrence.sport as EnduranceSport)
    : requested && isActivitySport(requested) && isEnduranceSport(requested)
      ? requested
      : null;

  // No sport and no occurrence means somebody reached this URL directly: the sports are
  // offered on Training itself now, so this sends them there rather than asking the same
  // question on a screen of its own.
  if (!sport) redirect("/training");

  const units = await withUser(getDb(), user.id, (tx) => unitsFor(tx, user.id, sport), {
    readOnly: true,
  });
  const target = occurrence?.prescription
    ? {
        title: occurrence.preparedByCoach ? "Your coach asked for" : "The plan asked for",
        lines: [
          describePrescription(occurrence.prescription, units),
          occurrence.prescription.running?.paceNote,
          occurrence.prescription.running?.symptomStopRule,
          occurrence.prescription.instructions,
        ].filter((line): line is string => Boolean(line)),
      }
    : null;

  // Measurements start blank. Context — the sport, the units, the pool — may preselect;
  // a performance never does (ACTUAL-01).
  const initial: Record<string, string> = {
    recordedTimeZone: profile.timeZone,
    startedAt: toDateTimeLocal(new Date(), profile.timeZone),
    distanceUnit: sport === "swimming" ? units.poolUnit : units.distanceUnit,
    poolLengthUnit: units.poolUnit,
    distanceValue: "",
    hours: "",
    minutes: "",
    seconds: "",
    effort: "",
  };
  const shared = {
    action: saveActivityAction.bind(null, null),
    submissionKey: crypto.randomUUID(),
    // The coach's preparation, when it is the target on screen, is named with the log: the
    // record says which plan was performed, not only which revision it was written against.
    occurrence: occurrence
      ? { id: occurrence.id, revisionId: occurrence.revisionId, planId: occurrence.preparedPlanId }
      : null,
    target,
    submitLabel: "Save activity",
    units,
  };

  // Boards Log a run, a ride, a swim: a layer over the tabs, its way back naming where it was
  // opened from (Today for the day's run, Training otherwise), Save pinned at its foot.
  return (
    <SessionPage title={`Log a ${sportNoun(sport)}`} back={{ href: "/training" }}>
      <ActivityEditor
        {...shared}
        userId={user.id}
        sport={sport}
        initial={{
          ...initial,
          environment: sport === "swimming" ? "pool" : "outdoor",
          assistance: "unknown",
          distanceMethod: "unknown",
        }}
      />
    </SessionPage>
  );
}

function sportNoun(sport: EnduranceSport): string {
  return sport === "running" ? "run" : sport === "cycling" ? "ride" : "swim";
}
