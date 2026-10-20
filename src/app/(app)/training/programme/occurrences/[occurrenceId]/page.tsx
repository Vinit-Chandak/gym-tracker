import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";

import { ActivityPlan, sessionLine } from "@/components/activities/activity-plan";
import {
  enduranceName,
  enduranceNote,
  LOG_LABEL,
  plannedName,
} from "@/components/activities/endurance-line";
import { OccurrenceActions } from "@/components/activities/occurrence-actions";
import { programmeClosureLine, showsClosure } from "@/components/activities/programme-closure";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CardLink } from "@/components/ui/card-link";
import { InfoTip } from "@/components/ui/info-tip";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORT_LABELS } from "@/domain/activity";
import { addDays, todayInTimeZone } from "@/domain/program-calendar";
import { putBackGoesNext, sessionStanding, standingByDate } from "@/domain/programme-sessions";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { activePlanForOccurrence } from "@/server/repositories/coach-plans";
import {
  getOccurrence,
  namedOccurrence,
  programmeClosure,
  type ProgrammeOccurrence,
} from "@/server/repositories/occurrences";
import { getSchedule } from "@/server/repositories/schedule";
import { readSportUnits } from "@/server/repositories/sport-preferences";
import { readHeartRate } from "@/server/repositories/heart-rate";
import { requireUuid } from "@/server/validation/params";
import { EARLY_DAYS } from "@/app/(app)/today/log/log-choices";
import { DEFAULT_SPORT_UNITS } from "@/lib/distance-units";
import { FACT_SEPARATOR, holdFigures, joinFacts } from "@/lib/facts";
import { formatIsoDate } from "@/lib/format";
import { originQuery } from "@/lib/nav";

/**
 * Everything the page reads, once a request: the document's title is named from it too, so it
 * says what the screen's own title does.
 */
const readSession = cache(async (occurrenceId: string) => {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const read = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const occurrence = await getOccurrence(tx, user.id, occurrenceId);
      return {
        occurrence,
        plan: await activePlanForOccurrence(tx, user.id, occurrenceId),
        units: occurrence ? await readSportUnits(tx, user.id) : DEFAULT_SPORT_UNITS,
        // The sequence it waits in, when it is the running programme's.
        schedule: occurrence?.familyId ? await getSchedule(tx, user.id) : null,
        // A closed session's day, which the running programme's days do not have: named as the
        // version that wrote it named it, as the activity that answered it names it.
        named: occurrence?.closed ? await namedOccurrence(tx, user.id, occurrenceId) : null,
        // How its programme stopped being the athlete's, where the page says so.
        closure:
          occurrence && showsClosure(occurrence)
            ? await programmeClosure(tx, user.id, occurrence.familyId, profile.timeZone)
            : null,
        // A zone target reads in the athlete's own beats (ADR 0059).
        zones:
          occurrence?.sport === "running"
            ? ((await readHeartRate(tx, profile, todayInTimeZone(profile.timeZone))).resolved
                ?.zones ?? null)
            : null,
      };
    },
    { readOnly: true },
  );
  return { profile, ...read };
});

type SessionRead = Awaited<ReturnType<typeof readSession>>;

/** The running programme it waits in, when it is that programme's session. */
function runningOf({ schedule }: SessionRead, occurrence: ProgrammeOccurrence) {
  return schedule && schedule.program.familyId === occurrence.familyId ? schedule : null;
}

/**
 * Its programme day, where it has one: the running programme's, or, for a closed session, the
 * day the version that wrote it had.
 */
function dayOf(read: SessionRead, occurrence: ProgrammeOccurrence) {
  const running = runningOf(read, occurrence);
  if (running && occurrence.cycleDayIndex !== null)
    return running.days.find((entry) => entry.dayIndex === occurrence.cycleDayIndex) ?? null;
  return read.named?.dayName ? { name: read.named.dayName, focus: read.named.dayFocus } : null;
}

/**
 * The coach's preparation, only when it was written against the revision in force: a plan
 * pinned to an older one describes a target the programme has since changed (§8.4).
 */
function preparedFor({ plan }: SessionRead, occurrence: ProgrammeOccurrence) {
  return plan && plan.occurrenceRevisionId === occurrence.revisionId
    ? (plan.endurance[0] ?? null)
    : null;
}

/**
 * Named for its day, as the programme's list and Today name it ("Tempo run"); else as every
 * screen names a planned session, its own name, its kind or its sport (`plannedName`), so an
 * unnamed run is "Run" here too.
 */
function sessionTitle(read: SessionRead, occurrence: ProgrammeOccurrence): string {
  const target = preparedFor(read, occurrence)?.prescription ?? occurrence.prescription;
  return dayOf(read, occurrence)?.name ?? plannedName(target, occurrence.sport, read.units);
}

export async function generateMetadata(
  props: PageProps<"/training/programme/occurrences/[occurrenceId]">,
): Promise<Metadata> {
  const { occurrenceId } = await props.params;
  // A malformed address is the page's to refuse; the title only names what is there.
  if (!z.uuid().safeParse(occurrenceId).success) return { title: "Not found" };
  const read = await readSession(occurrenceId);
  return { title: read.occurrence ? sessionTitle(read, read.occurrence) : "Not found" };
}

/**
 * One scheduled session: what it asks for, what became of it, and what can be done about it
 * (plan §7). Logging, skipping and moving all act on this session and no other. A session of a
 * programme the athlete has moved on from reads as it did when that programme ended, with one
 * line saying how it ended in place of what could be done (ADR 0054).
 */
export default async function OccurrencePage(
  props: PageProps<"/training/programme/occurrences/[occurrenceId]">,
) {
  const { occurrenceId } = await props.params;
  requireUuid(occurrenceId);
  const read = await readSession(occurrenceId);
  const { occurrence, units, closure, zones, profile } = read;
  if (!occurrence) notFound();
  const today = todayInTimeZone(profile.timeZone);
  // Put on the calendar by the athlete, not by a programme: it has no programme week to count
  // against, and it can be taken off again.
  const standalone = occurrence.familyId === null;
  // The running programme's session stands where its sequence has got to, as the programme
  // page reads it (ADR 0051): one whose date has gone by while the sequence waited for it is
  // still to do, not missed. Anything else — standalone work, a block since replaced — goes by
  // its date.
  const running = runningOf(read, occurrence);
  const standing = running
    ? sessionStanding(running.state, occurrence, today)
    : standingByDate(occurrence, today);
  const day = dayOf(read, occurrence);
  const title = sessionTitle(read, occurrence);
  const badge =
    standing === "next"
      ? { label: "Next", tone: "accent" as const }
      : standing === "not_done"
        ? { label: "Missed", tone: "neutral" as const }
        : // As the programme's list says it, whether it was skipped here or from Today.
          standing === "skipped"
          ? { label: "Skipped", tone: "neutral" as const }
          : null;
  // Why a date gone by is not missed, a tap away: beside Next, or beside "Still to do" for one
  // the sequence has yet to reach.
  const waited = (standing === "next" || standing === "to_come") && occurrence.scheduledOn < today;
  const waitedTip = waited && (
    <InfoTip label={standing === "next" ? "About next" : "About still to do"}>
      Its date has passed, but the programme waits for you.
    </InfoTip>
  );
  const prepared = preparedFor(read, occurrence);
  // One target on the page: the coach's, when it prepared this session inside the approved
  // range, and the programme's otherwise. The two used to be printed one above the other.
  const target = prepared?.prescription ?? occurrence.prescription;
  // Logged, the full plan gives way to what was done; a line of it stays, so what was asked for
  // can still be held against it (year audit, October 2026: "4.2–5 km" and nothing else).
  const logged = occurrence.resolution.kind === "logged";
  const planned = logged && target ? sessionLine(target, units) : null;
  const plannedNote = logged && target ? enduranceNote(target) : null;
  // The card is headed by what the session is for, its day's focus ("Zone 2"), where it has
  // one. The target is the plan's to say, once: its card under this one, or, once logged, the
  // line of it here (October 2026: "30 min" over "30 min · Effort 2–3 of 5").
  const headline = (day?.focus && holdFigures(day.focus)) || (!target ? "No targets set" : null);
  // A date of this year is said without it, as the programme's list says it.
  const year = today.slice(0, 4);
  const moved =
    occurrence.originalScheduledOn && occurrence.originalScheduledOn !== occurrence.scheduledOn
      ? occurrence.originalScheduledOn
      : null;
  // Log takes a session up to six days ahead (Log, ADR 0058); one further off leads with its
  // plan, and is logged once it is that close.
  const loggable = occurrence.loggable && occurrence.scheduledOn <= addDays(today, EARLY_DAYS);

  return (
    <>
      <PageHeader
        title={title}
        meta={joinFacts([
          // Its sport beside the date where its name does not already say it ("Run").
          title !== enduranceName(occurrence.sport) && ACTIVITY_SPORT_LABELS[occurrence.sport],
          // A run, ride or swim of a programme is placed by its week; a strength day by its cycle.
          occurrence.cycleIndex !== null &&
            `${occurrence.cycleDayIndex === null ? "Week" : "Cycle"} ${occurrence.cycleIndex}`,
          formatIsoDate(occurrence.scheduledOn, year),
        ])}
        backHref={(standalone ? "/plan" : `/plan/${occurrence.sport}`) as Route}
      />
      <PageContent>
        {/* Where it stands, alone: its chip on the page, not a card holding nothing else. */}
        {badge && !headline && !planned && !plannedNote && !moved ? (
          <span className={waited ? "inline-flex items-center gap-1" : undefined}>
            <Badge tone={badge.tone}>{badge.label}</Badge>
            {waitedTip}
          </span>
        ) : (
          (headline || badge || planned || plannedNote || (waited && !badge) || moved) && (
            <Card>
              {(headline || badge) && (
                // The badge stands at the headline's end while the headline keeps a few words'
                // room beside it, and goes under it rather than break "Threshold" in two (large
                // text).
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                  {headline && (
                    <h2 className="min-w-0 flex-[1_1_8rem] text-lg font-medium [overflow-wrap:break-word]">
                      {headline}
                    </h2>
                  )}
                  {badge && (
                    // Wrapped under the headline, it starts the line, as the plan card's badge
                    // does under its words.
                    <span className={waited ? "inline-flex items-center gap-1" : undefined}>
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                      {waitedTip}
                    </span>
                  )}
                </div>
              )}
              {planned && <p className="text-sm text-ink-muted tabular-nums">{planned}</p>}
              {plannedNote && (
                <p className="text-sm [overflow-wrap:break-word] text-ink-muted">{plannedNote}</p>
              )}
              {waited && !badge && (
                <p className="flex items-center gap-1 text-sm text-ink-muted">
                  Still to do
                  {waitedTip}
                </p>
              )}
              {moved && (
                <p className="text-sm text-ink-muted">Moved from {formatIsoDate(moved, year)}.</p>
              )}
            </Card>
          )
        )}

        {!logged && (
          <ActivityPlan
            sport={occurrence.sport}
            prescription={target}
            preparation={prepared ? { summary: prepared.summary, note: prepared.note } : null}
            preparedByCoach={prepared !== null}
            showSource={!occurrence.closed && (!standalone || prepared !== null)}
            units={units}
            zones={zones}
            titled={target?.title !== title}
          />
        )}

        {occurrence.resolution.kind === "logged" ? (
          // The way into the record, as Today's card says it: in ink and bold, led on by its
          // chevron, with the day it was logged. It names the programme, or Plan for a session
          // of none, as this page's Back does, so Plan stays selected (NAV-03).
          <Card>
            <CardLink
              href={`/training/activities/${occurrence.resolution.activityId}${originQuery(
                standalone ? "plan" : "programme",
              )}`}
            >
              {`See what you logged${FACT_SEPARATOR}${formatIsoDate(occurrence.resolution.occurredOn, year)}`}
            </CardLink>
          </Card>
        ) : occurrence.resolution.kind === "legacy_completed" ? (
          <Card>
            <p className="text-sm text-ink-muted">Done before records were kept.</p>
          </Card>
        ) : occurrence.resolution.kind === "cancelled" ? (
          <Card>
            <p className="text-sm text-ink-muted">
              {standalone ? "Taken off the calendar." : "Removed from the programme."}
            </p>
          </Card>
        ) : occurrence.closed ? (
          // Owed or skipped when its programme ended, and left so: nothing here can log, skip,
          // put back or move it, and the server refuses each (ADR 0054).
          <Card>
            <p className="text-sm [overflow-wrap:break-word] text-ink-muted">
              {programmeClosureLine(closure, year)}.
            </p>
          </Card>
        ) : (
          <>
            {/* The page's one primary: logging this session, in its sport's words. */}
            {loggable && (
              <LinkButton
                href={`/training/new?occurrence=${occurrence.id}&date=${occurrence.scheduledOn <= today ? occurrence.scheduledOn : today}`}
                className="w-full"
              >
                {occurrence.sport === "strength" ? "Log workout" : LOG_LABEL[occurrence.sport]}
              </LinkButton>
            )}
            <OccurrenceActions
              occurrenceId={occurrence.id}
              skipped={occurrence.disposition === "skipped"}
              scheduledOn={occurrence.scheduledOn}
              today={today}
              standalone={standalone}
              putBackGoesNext={
                running !== null &&
                occurrence.disposition === "skipped" &&
                putBackGoesNext(running.state, occurrence)
              }
            />
          </>
        )}
      </PageContent>
    </>
  );
}
