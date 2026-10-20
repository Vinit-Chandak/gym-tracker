import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";

import { ActivityPlan, sessionLine } from "@/components/activities/activity-plan";
import { enduranceNote } from "@/components/activities/endurance-line";
import { OccurrenceActions } from "@/components/activities/occurrence-actions";
import { programmeClosureLine, showsClosure } from "@/components/activities/programme-closure";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CardLink } from "@/components/ui/card-link";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORT_LABELS } from "@/domain/activity";
import { describePrescription } from "@/domain/activity-prescription";
import { todayInTimeZone } from "@/domain/program-calendar";
import { putBackGoesNext, sessionStanding, standingByDate } from "@/domain/programme-sessions";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { activePlanForOccurrence } from "@/server/repositories/coach-plans";
import {
  getOccurrence,
  namedOccurrence,
  programmeClosure,
} from "@/server/repositories/occurrences";
import { getSchedule } from "@/server/repositories/schedule";
import { readSportUnits } from "@/server/repositories/sport-preferences";
import { readHeartRate } from "@/server/repositories/heart-rate";
import { requireUuid } from "@/server/validation/params";
import { DEFAULT_SPORT_UNITS } from "@/lib/distance-units";
import { holdFigures, joinFacts } from "@/lib/facts";
import { formatIsoDate } from "@/lib/format";
import { originQuery } from "@/lib/nav";

export const metadata: Metadata = { title: "Scheduled session" };

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
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const { occurrence, plan, units, schedule, named, closure, zones } = await withUser(
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
  if (!occurrence) notFound();
  const today = todayInTimeZone(profile.timeZone);
  // Put on the calendar by the athlete, not by a programme: it lives on Scheduled, it has no
  // programme week to count against, and it can be taken off again.
  const standalone = occurrence.familyId === null;
  // The running programme's session stands where its sequence has got to, as the programme
  // page reads it (ADR 0051): one whose date has gone by while the sequence waited for it is
  // still to do, not missed. Anything else — standalone work, a block since replaced — goes by
  // its date.
  const running = schedule && schedule.program.familyId === occurrence.familyId ? schedule : null;
  const standing = running
    ? sessionStanding(running.state, occurrence, today)
    : standingByDate(occurrence, today);
  const day =
    running && occurrence.cycleDayIndex !== null
      ? (running.days.find((entry) => entry.dayIndex === occurrence.cycleDayIndex) ?? null)
      : named?.dayName
        ? { name: named.dayName, focus: named.dayFocus }
        : null;
  const dayName = day?.name ?? null;
  const badge =
    standing === "next"
      ? { label: "Next", tone: "accent" as const }
      : standing === "not_done"
        ? { label: "Missed", tone: "neutral" as const }
        : // As the programme's list says it, whether it was skipped here or from Today.
          standing === "skipped"
          ? { label: "Skipped", tone: "neutral" as const }
          : null;
  const waited = (standing === "next" || standing === "to_come") && occurrence.scheduledOn < today;
  // The preparation is only this session's if it was written against the revision in force;
  // a plan pinned to an older one describes a target the programme has since changed (§8.4).
  const prepared =
    plan && plan.occurrenceRevisionId === occurrence.revisionId
      ? (plan.endurance[0] ?? null)
      : null;
  // One target on the page: the coach's, when it prepared this session inside the approved
  // range, and the programme's otherwise. The two used to be printed one above the other.
  const target = prepared?.prescription ?? occurrence.prescription;
  // Logged, the full plan gives way to what was done; a line of it stays, so what was asked for
  // can still be held against it (year audit, October 2026: "4.2–5 km" and nothing else).
  const logged = occurrence.resolution.kind === "logged";
  const planned = logged && target ? sessionLine(target, units) : null;
  const plannedNote = logged && target ? enduranceNote(target) : null;
  // The card is headed by what the session is for, its day's focus ("Zone 2"), where it has
  // one. Without one it is headed by the target until it is logged; logged, the line of the plan
  // under it already says the target, and saying it twice was the audit's "2.6–3.1 km" over
  // "2.6–3.1 km · 18–22 min" (October 2026).
  const headline =
    (day?.focus && holdFigures(day.focus)) ??
    (!target ? "No targets set" : logged ? null : describePrescription(target, units));
  // A date of this year is said without it, as the programme's list says it.
  const year = today.slice(0, 4);
  const sport = ACTIVITY_SPORT_LABELS[occurrence.sport];

  return (
    <>
      <PageHeader
        // Named for its day, as the programme's list and Today name it ("Tempo run"), with its
        // sport beside the date; work no programme day owns is named for its sport.
        title={dayName ?? sport}
        meta={joinFacts([
          dayName && sport,
          occurrence.cycleIndex !== null && `Cycle ${occurrence.cycleIndex}`,
          `planned for ${formatIsoDate(occurrence.scheduledOn, year)}`,
        ])}
        backHref={(standalone ? "/plan" : `/plan/${occurrence.sport}`) as Route}
      />
      <PageContent>
        <Card>
          {(headline || badge) && (
            // The badge stands at the headline's end while the headline keeps a few words' room
            // beside it, and goes under it rather than break "Threshold" in two (large text).
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              {headline && (
                <h2 className="min-w-0 flex-[1_1_8rem] text-lg font-medium [overflow-wrap:break-word]">
                  {headline}
                </h2>
              )}
              {badge && (
                // Wrapped under the headline, it starts the line, as the plan card's badge does
                // under its words. Every badge here has a headline beside it.
                <span>
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                </span>
              )}
            </div>
          )}
          {planned && <p className="text-sm text-ink-muted tabular-nums">{planned}</p>}
          {plannedNote && (
            <p className="text-sm [overflow-wrap:break-word] text-ink-muted">{plannedNote}</p>
          )}
          {waited && (
            <p className="text-sm text-ink-muted">
              Its date has gone by, but the programme waits for you: it is still to do.
            </p>
          )}
          {occurrence.originalScheduledOn &&
            occurrence.originalScheduledOn !== occurrence.scheduledOn && (
              <p className="text-sm text-ink-muted">
                Moved from {formatIsoDate(occurrence.originalScheduledOn, year)}.
                {standalone ? "" : " Adherence still counts against that week."}
              </p>
            )}
        </Card>

        {!logged && (
          <ActivityPlan
            sport={occurrence.sport}
            prescription={target}
            preparation={prepared ? { summary: prepared.summary, note: prepared.note } : null}
            preparedByCoach={prepared !== null}
            showSource={!occurrence.closed && (!standalone || prepared !== null)}
            units={units}
            zones={zones}
          />
        )}

        {occurrence.resolution.kind === "logged" ? (
          <Card>
            <p className="text-sm text-ink-muted">
              Logged on {formatIsoDate(occurrence.resolution.occurredOn, year)}.
            </p>
            {/* The way into the record, as Today's card says it: in ink and bold, led on by its
                chevron. In plain ink alone it read as a second line of the sentence above it
                (year audit, October 2026). It names the programme, or Training for a session of
                none, as this page's Back does, so Training stays selected (NAV-03). */}
            <CardLink
              href={`/training/activities/${occurrence.resolution.activityId}${originQuery(
                standalone ? "plan" : "programme",
              )}`}
            >
              See what you logged
            </CardLink>
          </Card>
        ) : occurrence.resolution.kind === "legacy_completed" ? (
          <Card>
            <p className="text-sm text-ink-muted">
              Completed before this was recorded in full. There is no activity behind it, and none
              was invented.
            </p>
          </Card>
        ) : occurrence.resolution.kind === "cancelled" ? (
          <Card>
            <p className="text-sm text-ink-muted">
              {standalone
                ? "This session was taken off the calendar. It no longer needs to be logged."
                : "This session was removed from the programme. It no longer needs to be logged."}
            </p>
          </Card>
        ) : occurrence.closed ? (
          // Owed or skipped when its programme ended, and left so: nothing here can log, skip,
          // put back or move it, and the server refuses each (ADR 0054).
          <Card>
            <p className="text-sm [overflow-wrap:break-word] text-ink-muted">
              {programmeClosureLine(closure, year)}, so this session can no longer be logged.
            </p>
          </Card>
        ) : (
          <>
            {occurrence.loggable && (
              <LinkButton
                href={`/training/new?occurrence=${occurrence.id}&date=${occurrence.scheduledOn <= today ? occurrence.scheduledOn : today}`}
                className="w-full"
              >
                Log it
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
