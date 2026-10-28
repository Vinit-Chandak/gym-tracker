import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";

import { enduranceName } from "@/components/activities/endurance-line";
import { Art } from "@/components/art/art";
import { BackLink } from "@/components/shell/back-link";
import { FitTitle } from "@/components/ui/fit-title";
import { Figures } from "@/components/ui/figures";
import { Glyph, type GlyphName } from "@/components/ui/glyphs";
import { aboutLabel } from "@/components/ui/about-label";
import { InfoTip } from "@/components/ui/info-tip";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { describeEffort } from "@/domain/activity";
import {
  actualDistanceMetres,
  formatPaceSeconds,
  formatSpeed,
  lapFigures,
  paceHasRests,
  pacePerUnit,
  paceSecondsPerKm,
  repPace,
  speedMetresPerSecond,
  swimPaceSecondsPer100,
} from "@/domain/activity-metrics";
import { formatDuration } from "@/domain/pace";
import { todayInTimeZone } from "@/domain/program-calendar";
import { DEFAULT_SPORT_UNITS, sportDistanceParts } from "@/lib/distance-units";
import { ORIGIN_PARAM, originPath, originQuery, parseOrigin } from "@/lib/nav";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { RUN_TYPE_LABELS } from "@/domain/run-types";
import { getActivity } from "@/server/repositories/activities";
import { readHeartRate } from "@/server/repositories/heart-rate";
import { namedOccurrence } from "@/server/repositories/occurrences";
import { readSportUnits } from "@/server/repositories/sport-preferences";
import { requireUuid } from "@/server/validation/params";

import { ActivityMore } from "./activity-more";
import { answeredName, CountsAsRow } from "./answered-session";
import type { AnsweredOnDelete } from "./delete-button";
import { recordedExtras, type ActivityStat } from "./recorded-extras";
import { RunLaps } from "./run-laps";
import { SavedBar } from "./saved-bar";
import { startedAtLine } from "./started-at";

const PRINT = { running: "run", cycling: "ride", swimming: "swim" } as const;
const NOUN = { running: "run", cycling: "ride", swimming: "swim" } as const;

/** Where it happened, as the log form offered it. */
const WHERE: Record<string, { glyph: GlyphName; label: string }> = {
  outdoor: { glyph: "outdoor", label: "Outdoor" },
  treadmill: { glyph: "treadmill", label: "Treadmill" },
  indoor: { glyph: "trainer", label: "Indoor" },
  pool: { glyph: "pool", label: "Pool" },
  open_water: { glyph: "openwater", label: "Open water" },
};

/** "3 km" as its figure and its unit. */
function split(text: string): { figure: string; unit?: string } {
  const at = text.indexOf(" ");
  return at < 0 ? { figure: text } : { figure: text.slice(0, at), unit: text.slice(at + 1) };
}

/** The record and what it is read against, once a request: the document is named from it too. */
const readRecord = cache(async (activityId: string) => {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const read = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const activity = await getActivity(tx, user.id, activityId);
      return {
        activity,
        units: activity ? await readSportUnits(tx, user.id) : DEFAULT_SPORT_UNITS,
        answered: activity?.origin.occurrenceId
          ? await namedOccurrence(tx, user.id, activity.origin.occurrenceId)
          : null,
        // A run's heart rate reads against the athlete's zones (ADR 0059).
        heartRate:
          activity?.actual?.sport === "running"
            ? (await readHeartRate(tx, profile, todayInTimeZone(profile.timeZone))).resolved
            : null,
      };
    },
    { readOnly: true },
  );
  return { profile, ...read };
});

/** Named as its title is: its own title, else what History and its day call it ("Ride"). */
export async function generateMetadata(
  props: PageProps<"/progress/activities/[activityId]">,
): Promise<Metadata> {
  const { activityId } = await props.params;
  // A malformed address is the page's to refuse; the title only names what is there.
  if (!z.uuid().safeParse(activityId).success) return { title: "Not found" };
  const { activity } = await readRecord(activityId);
  return { title: activity ? (activity.title ?? enduranceName(activity.sport)) : "Not found" };
}

/**
 * One logged activity, whatever sport it is (board Run): its print in full ink, its name, when
 * and where, then what it recorded two by two, and its notes. Correcting and deleting it are
 * behind More.
 *
 * Each sport shows what it actually recorded and nothing more: a ride with no distance shows
 * no speed, a swim timed only end to end shows no pace, and an effort nobody confirmed says
 * so rather than passing for a report (plan §§4, 9.1).
 */
export default async function ActivityPage(props: PageProps<"/progress/activities/[activityId]">) {
  const { activityId } = await props.params;
  requireUuid(activityId);
  // Passed on to the correction, so the tab it was opened from stays selected through it, and
  // where Back goes without a page before it: that tab, or History with none (NAV-03).
  const search = await props.searchParams;
  const origin = parseOrigin(search[ORIGIN_PARAM]);
  // Just saved from its form (activity-editor.tsx): a new record or a correction.
  const saved = search.saved === "new" || search.saved === "changed" ? search.saved : null;
  const { profile, activity, units, answered, heartRate } = await readRecord(activityId);
  if (!activity) notFound();

  // Read in the athlete's own units: a distance and its pace or speed in km or mi, a swim and
  // its pace in m or yd, whatever unit each number was typed in. The record keeps both.
  const actual = activity.actual;
  const metres = actual ? actualDistanceMetres(actual) : null;
  const stats: ActivityStat[] = [
    {
      label: "Distance",
      ...(metres === null || !actual
        ? { figure: "—" }
        : sportDistanceParts(metres, actual.sport, units)),
    },
    {
      label: "Time",
      figure: activity.durationMs === null ? "—" : formatDuration(activity.durationMs / 1000),
    },
  ];
  if (actual?.sport === "running") {
    const overall = formatPaceSeconds(
      pacePerUnit(paceSecondsPerKm(actual.distance.metres, actual.durationMs), units.distanceUnit),
    );
    if (paceHasRests(actual)) {
      // An interval session leads with its reps' pace, the pace that counts; its own distance
      // over its time has the rests in it and says so (DESIGN.md, Laps and intervals).
      const reps = repPace(actual.laps.map(lapFigures));
      if (reps)
        stats.unshift({
          label: "Rep pace",
          figure: formatPaceSeconds(pacePerUnit(reps.secondsPerKm, units.distanceUnit)),
          unit: `/${units.distanceUnit}`,
          note: `${reps.reps} ${reps.reps === 1 ? "rep" : "reps"}`,
        });
      stats.push({ label: "Overall, with rests", figure: overall, unit: `/${units.distanceUnit}` });
    } else stats.push({ label: "Pace", figure: overall, unit: `/${units.distanceUnit}` });
  }
  // A ride's speed is its distance over its time: one with no distance (an indoor ride, as a
  // rule) has none to show, not a second dash beside the distance's (AT-LOG-03).
  if (actual?.sport === "cycling" && metres !== null)
    stats.push({
      label: "Speed",
      ...split(formatSpeed(speedMetresPerSecond(metres, actual.durationMs), units.distanceUnit)),
    });
  if (actual?.sport === "swimming") {
    const pace = swimPaceSecondsPer100(actual, units.poolUnit);
    stats.push({
      label: "Pace",
      figure: pace === null ? "—" : formatPaceSeconds(pace, 1),
      unit: `/100 ${units.poolUnit}`,
      // Timed end to end only: its dash says there is no pace, and the ⓘ beside it says why.
      info:
        actual.activeMs === null
          ? "Only its elapsed time was recorded: a pace needs the swimming time, rests left out."
          : undefined,
    });
  }
  // The day and time it happened where it was recorded, as History dates it and the
  // correction says it over its form.
  const startedAt = startedAtLine(activity.startedAt, activity.recordedTimeZone, profile.timeZone);
  stats.push({ label: "Effort", figure: describeEffort(activity.effort) });
  if (actual) stats.push(...recordedExtras(actual, units, heartRate));

  const sport = activity.sport === "strength" ? null : activity.sport;
  // A session's name, as History and its day name it: "Ride", not the sport's "Cycling".
  const title = activity.title ?? enduranceName(activity.sport);
  const where = actual ? WHERE[actual.environment] : undefined;
  // What deleting it does to the session it answered: gives it back to be logged, unless its
  // programme has ended, when nothing can be logged against it again (ADR 0054).
  const onDelete: AnsweredOnDelete =
    activity.origin.kind !== "planned" ? null : answered?.closed ? "closed" : "reopens";
  // What it counts as, in one row: the session it answered, or Unplanned (ADR 0058). The row
  // opens Counts as, where it can change, unless its session's programme has ended, which keeps
  // its answer (ADR 0054): then it opens that session's page.
  const countsAs =
    activity.origin.kind === "planned"
      ? answered
        ? answeredName(answered, todayInTimeZone(profile.timeZone).slice(0, 4))
        : "A planned session"
      : sport
        ? "Unplanned"
        : null;
  const countsAsHref =
    sport && !answered?.closed
      ? (`/progress/activities/${activity.id}/counts-as` as Route)
      : answered
        ? (`/plan/sessions/${answered.id}` as Route)
        : null;

  return (
    <>
      <header className="page-header page-width pt-safe">
        <div className="page-header-bar">
          <BackLink fallback={originPath(origin)} />
          <div className="page-header-action">
            <ActivityMore
              label={`Correct or delete this ${sport ? NOUN[sport] : "activity"}`}
              title={title}
              editHref={`/progress/activities/${activity.id}/edit${originQuery(origin)}` as Route}
              activityId={activity.id}
              noun={sport ? NOUN[sport] : undefined}
              answered={onDelete}
            />
          </div>
        </div>
      </header>
      <div className="page-width pb-8">
        {saved && (
          <SavedBar
            activityId={activity.id}
            undo={saved === "new"}
            origin={origin}
            said={
              saved === "changed"
                ? "Changes saved"
                : `${sport ? NOUN[sport][0]!.toUpperCase() + NOUN[sport].slice(1) : "Activity"} saved${
                    actual?.sport === "running" && actual.runType === "intervals"
                      ? " as intervals"
                      : ""
                  }`
            }
          />
        )}
        {sport && (
          <figure className="activity-print">
            <Art
              kind="print"
              parts={[{ kind: PRINT[sport], state: "done" }]}
              label={`The ${NOUN[sport]}, in full ink`}
              className="size-full"
            />
          </figure>
        )}
        <FitTitle as="h1" sizes={{ base: 30, narrow: 28 }} className="mt-3">
          {title}
        </FitTitle>
        {/* When and where, the title's second tone (owner, 28 October 2026). */}
        <p className="page-fact meta-line">
          <span className="meta-fact">
            <Glyph name="calendar" label="Date" className="glyph-16" />
            {/* Its time as a figure, as History's is. */}
            <Figures>{startedAt}</Figures>
          </span>
          {where && (
            <span className="meta-fact">
              <Glyph name={where.glyph} className="glyph-16" />
              {where.label}
            </span>
          )}
          {actual?.sport === "running" && actual.runType && (
            <span className="meta-fact">
              <Glyph name="target" className="glyph-16" />
              {RUN_TYPE_LABELS[actual.runType]}
            </span>
          )}
          {activity.outcome === "ended_early" && <span className="meta-fact">Ended early</span>}
        </p>

        <dl className="activity-stats">
          {stats.map((stat) => (
            <div key={stat.label} className="activity-stat">
              <dt className="activity-stat-label">{stat.label}</dt>
              <dd className="activity-stat-figure">
                <span className={/\d/.test(stat.figure) ? "type-figure-l" : "type-heading"}>
                  {stat.figure}
                </span>
                {stat.unit && <span className="activity-stat-unit">{stat.unit}</span>}
                {/* Beside the figure it explains (a dash), never inside the stat's name. */}
                {stat.info && <InfoTip label={aboutLabel(stat.label)}>{stat.info}</InfoTip>}
                {stat.note && <span className="activity-stat-note">{stat.note}</span>}
              </dd>
            </div>
          ))}
        </dl>

        {actual?.sport === "running" && (
          <RunLaps laps={actual.laps} units={units} heartRate={heartRate} />
        )}

        {countsAs && <CountsAsRow value={countsAs} href={countsAsHref} />}
        {activity.notes && (
          <p className="mt-3 box panel-padding type-body [overflow-wrap:break-word] whitespace-pre-wrap">
            {activity.notes}
          </p>
        )}
      </div>
    </>
  );
}
