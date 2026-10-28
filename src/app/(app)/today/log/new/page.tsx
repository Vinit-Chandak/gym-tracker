import type { Metadata, Route } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { ActivityEditor } from "@/components/activities/activity-editor";
import { plannedName } from "@/components/activities/endurance-line";
import { OccurrenceSettled, settledTitle } from "@/components/activities/occurrence-settled";
import { showsClosure } from "@/components/activities/programme-closure";
import { SessionPage } from "@/components/shell/session-page";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { structureLines } from "@/components/activities/prescription-lines";
import { isActivitySport, isEnduranceSport, type EnduranceSport } from "@/domain/activity";
import { describePrescription } from "@/domain/activity-prescription";
import { formatIsoDate } from "@/lib/format";
import { plannedLaps } from "@/lib/run-laps";
import { ORIGIN_PARAM, originPath, parseOrigin, sessionPath } from "@/lib/nav";
import { toDateTimeLocal } from "@/lib/time";
import { todayInTimeZone } from "@/domain/program-calendar";
import { z } from "zod";
import { saveActivityAction } from "@/server/actions/activities";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { readHeartRate } from "@/server/repositories/heart-rate";
import { getOccurrence, programmeClosure } from "@/server/repositories/occurrences";
import { withPreparedTargets } from "@/server/repositories/coach-plans";
import { readSportUnits } from "@/server/repositories/sport-preferences";
import { requireUuid } from "@/server/validation/params";

/** One value only. A repeated singleton parameter is a mistake, not a choice to resolve. */
function single(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * The session `?occurrence=` names, read once a request: the page logs it or says what became
 * of it, and the document's title says the same.
 */
const readOccurrence = cache(async (occurrenceId: string) => {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  return withUser(
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
  );
});

/** Named as its header is: "Log a run", or what became of a session that cannot be logged. */
export async function generateMetadata(props: PageProps<"/today/log/new">): Promise<Metadata> {
  const search = await props.searchParams;
  const occurrenceId = single(search.occurrence);
  const requested = single(search.sport);
  if (occurrenceId && z.uuid().safeParse(occurrenceId).success) {
    const { occurrence, closure } = await readOccurrence(occurrenceId);
    if (occurrence && !occurrence.loggable) return { title: settledTitle(occurrence, closure) };
    if (occurrence && isEnduranceSport(occurrence.sport))
      return { title: `Log a ${sportNoun(occurrence.sport)}` };
  }
  return {
    title:
      requested && isActivitySport(requested) && isEnduranceSport(requested)
        ? `Log a ${sportNoun(requested)}`
        : "Log a session",
  };
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
export default async function NewActivityPage(props: PageProps<"/today/log/new">) {
  const search = await props.searchParams;

  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const selectedDate = single(search.date) ?? todayInTimeZone(profile.timeZone);
  if (
    !z.iso.date().safeParse(selectedDate).success ||
    selectedDate > todayInTimeZone(profile.timeZone)
  )
    notFound();
  const occurrenceId = single(search.occurrence);
  if (search.occurrence !== undefined && !occurrenceId) notFound();
  if (occurrenceId) requireUuid(occurrenceId);
  const { occurrence, closure } = occurrenceId
    ? await readOccurrence(occurrenceId)
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
  // offered by Today's Log (ADR 0058), so this sends them there rather than asking the same
  // question on a screen of its own.
  if (!sport) redirect("/today/log");

  const { units, zones } = await withUser(
    getDb(),
    user.id,
    async (tx) => ({
      units: await readSportUnits(tx, user.id),
      // A planned run's zone targets read in the athlete's own beats (ADR 0059).
      zones:
        occurrence?.prescription?.sport === "running"
          ? ((await readHeartRate(tx, profile, todayInTimeZone(profile.timeZone))).resolved
              ?.zones ?? null)
          : null,
    }),
    { readOnly: true },
  );
  // What the plan asked for: its figure, and its stop rule, in view; its steps and how to do it
  // folded under them, since each lap's empty fields show what the plan asked of that lap while
  // it is typed (ADR 0059).
  const target = occurrence?.prescription
    ? {
        title: occurrence.preparedByCoach ? "Your coach asked for" : "The plan asked for",
        figure: describePrescription(occurrence.prescription, units),
        stop: occurrence.prescription.running?.symptomStopRule ?? null,
        steps: structureLines(occurrence.prescription, units, zones).map((line) =>
          line.kind === "repeat" ? `${line.lead} ${line.text}` : `${line.lead}: ${line.text}`,
        ),
        notes: [
          occurrence.prescription.running?.paceNote,
          occurrence.prescription.instructions,
        ].filter((line): line is string => Boolean(line)),
      }
    : null;

  // Measurements start blank. Context — the sport, the units, the pool — may preselect;
  // a performance never does (ACTUAL-01).
  const initial: Record<string, string> = {
    recordedTimeZone: profile.timeZone,
    startedAt:
      selectedDate < todayInTimeZone(profile.timeZone)
        ? ""
        : toDateTimeLocal(new Date(), profile.timeZone),
    ...(selectedDate < todayInTimeZone(profile.timeZone)
      ? { entryDate: selectedDate, entryTime: "", latestDate: todayInTimeZone(profile.timeZone) }
      : {}),
    distanceUnit: sport === "swimming" ? units.poolUnit : units.distanceUnit,
    poolLengthUnit: units.poolUnit,
    distanceValue: "",
    hours: "",
    minutes: "",
    seconds: "",
    effort: "",
    // What kind of run the session is: context, which may preselect, not a performance.
    runType: occurrence?.prescription?.running?.sessionType ?? "",
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
    // Named with what it saves, as the screen's title names what it logs.
    submitLabel: `Save ${sportNoun(sport)}`,
    units,
    plannedLaps: plannedLaps(occurrence?.prescription ?? null, units.distanceUnit),
  };

  // Where it was opened from: Today unless a link says otherwise. The activity it saves opens
  // under that tab and goes back to it, as this page does (NAV-03).
  const origin = parseOrigin(search[ORIGIN_PARAM]) ?? "today";
  const today = todayInTimeZone(profile.timeZone);

  // Boards Log a run, a ride, a swim: a layer over the tabs, its way back naming where it was
  // opened from, Today unless a link said otherwise (ADR 0058), Save pinned at its foot.
  return (
    <SessionPage
      title={`Log a ${sportNoun(sport)}`}
      meta={
        selectedDate < today ? `For ${formatIsoDate(selectedDate, today.slice(0, 4))}` : undefined
      }
      back={
        // Opened from its session's page, it goes back there, named as that session is.
        origin === "session" && occurrence
          ? {
              href: sessionPath(occurrence.id),
              label: plannedName(occurrence.prescription, occurrence.sport, units),
            }
          : { href: originPath(origin) as Route }
      }
    >
      <ActivityEditor
        {...shared}
        origin={origin}
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
