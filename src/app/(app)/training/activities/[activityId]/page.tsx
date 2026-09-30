import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HeroCard } from "@/components/ui/hero-card";
import { SPORT_ICON } from "@/components/ui/sport-chip";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORT_LABELS, describeEffort, type SwimStroke } from "@/domain/activity";
import {
  actualDistanceMetres,
  formatPaceSeconds,
  formatSpeed,
  paceSecondsPerKm,
  speedMetresPerSecond,
  swimPaceSecondsPer100,
  type EnduranceActual,
} from "@/domain/activity-metrics";
import { formatDuration } from "@/domain/pace";
import { formatDistance, type LengthUnit } from "@/lib/distance-units";
import { formatDateTime } from "@/lib/format";
import { ORIGIN_PARAM, originQuery, parseOrigin } from "@/lib/nav";
import { SPORT_TONE } from "@/lib/sport-tone";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getActivity } from "@/server/repositories/activities";
import { requireUuid } from "@/server/validation/params";

import { DeleteActivityButton } from "./delete-button";

export const metadata: Metadata = { title: "Activity" };

const ENVIRONMENT_LABELS: Record<string, string> = {
  outdoor: "outdoor",
  treadmill: "treadmill",
  indoor: "indoor",
  pool: "pool",
  open_water: "open water",
};

const STROKE_LABELS: Record<SwimStroke, string | null> = {
  freestyle: "Freestyle",
  backstroke: "Backstroke",
  breaststroke: "Breaststroke",
  butterfly: "Butterfly",
  mixed: "Mixed",
  drill: "Drill",
  unspecified: null,
};

/** A figure and its unit, kept apart so the figure can be set in the display face. */
type Figure = { value: string; unit?: string };

function split(text: string): Figure {
  const [value, ...unit] = text.split(" ");
  return { value: value ?? text, unit: unit.join(" ") || undefined };
}

/**
 * The one figure the activity is remembered by: how far, in the unit it was entered in, or
 * how long when no distance was recorded. A swim's distance is in its pool's own unit.
 */
function headline(actual: EnduranceActual | null, durationMs: number | null): Figure | null {
  const metres = actual ? actualDistanceMetres(actual) : null;
  if (actual && metres !== null) {
    const unit: LengthUnit =
      actual.sport === "swimming"
        ? ((actual.distanceMethod === "lengths"
            ? actual.poolLength?.unit
            : actual.distance?.unit) ?? "m")
        : (actual.distance?.unit ?? "km");
    return split(formatDistance(metres, unit));
  }
  return durationMs === null ? null : { value: formatDuration(durationMs / 1000) };
}

/**
 * What else was recorded, one row each, and only what was recorded: an empty measurement is
 * not a zero, so it is left out rather than printed as a dash.
 */
function details(actual: EnduranceActual | null): [string, string][] {
  if (!actual) return [];
  const rows: [string, string | null][] = [];
  const heartRate: [string, string | null][] = [
    [
      "Average heart rate",
      actual.averageHeartRate === null ? null : `${actual.averageHeartRate} bpm`,
    ],
    ["Maximum heart rate", actual.maxHeartRate === null ? null : `${actual.maxHeartRate} bpm`],
  ];
  if (actual.sport === "running") {
    rows.push(
      ["Surface", actual.surface],
      [
        "Elevation gain",
        actual.elevationGainMetres === null ? null : `${actual.elevationGainMetres} m`,
      ],
      [
        "Incline",
        actual.treadmillInclinePercent === null ? null : `${actual.treadmillInclinePercent}%`,
      ],
      [
        "Cadence",
        actual.cadenceStepsPerMinute === null ? null : `${actual.cadenceStepsPerMinute} steps/min`,
      ],
    );
  }
  if (actual.sport === "cycling") {
    rows.push(
      [
        "Assistance",
        actual.assistance === "unknown"
          ? null
          : actual.assistance === "assisted"
            ? "Assisted"
            : "Unassisted",
      ],
      ["Average power", actual.averagePowerWatts === null ? null : `${actual.averagePowerWatts} W`],
      [
        "Average cadence",
        actual.averageCadenceRpm === null ? null : `${actual.averageCadenceRpm} rpm`,
      ],
      [
        "Elevation gain",
        actual.elevationGainMetres === null ? null : `${actual.elevationGainMetres} m`,
      ],
    );
  }
  if (actual.sport === "swimming") {
    rows.push(
      [
        "Pool length",
        actual.poolLength === null
          ? null
          : formatDistance(actual.poolLength.metres, actual.poolLength.unit),
      ],
      ["Lengths", actual.lengths === null ? null : String(actual.lengths)],
      ["Swimming time", actual.activeMs === null ? null : formatDuration(actual.activeMs / 1000)],
      ["Stroke", STROKE_LABELS[actual.stroke]],
      ["Strokes taken", actual.strokeCount === null ? null : String(actual.strokeCount)],
    );
  }
  rows.push(...heartRate);
  return rows.filter((row): row is [string, string] => row[1] !== null && row[1] !== "");
}

/**
 * One logged activity, whatever sport it is.
 *
 * Each sport shows what it actually recorded and nothing more: a ride with no distance shows
 * no speed, a swim timed only end to end shows no pace, and an effort nobody confirmed says
 * so rather than passing for a report (plan §§4, 9.1).
 */
export default async function ActivityPage(props: PageProps<"/training/activities/[activityId]">) {
  const { activityId } = await props.params;
  requireUuid(activityId);
  // Passed on to the correction, so the tab it was opened from stays selected through it.
  const origin = parseOrigin((await props.searchParams)[ORIGIN_PARAM]);
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const activity = await withUser(getDb(), user.id, (tx) => getActivity(tx, user.id, activityId), {
    readOnly: true,
  });
  if (!activity) notFound();

  const actual = activity.actual;
  const metres = actual ? actualDistanceMetres(actual) : null;
  const tone = SPORT_TONE[activity.sport];
  const Icon = SPORT_ICON[activity.sport];
  const figure = headline(actual, activity.durationMs);
  // The time is the headline when there is no distance, so it is not repeated beneath it.
  const timeIsHeadline = metres === null;

  const stats: { label: string; figure: Figure }[] = [];
  if (!timeIsHeadline && activity.durationMs !== null) {
    stats.push({ label: "Time", figure: { value: formatDuration(activity.durationMs / 1000) } });
  }
  if (actual?.sport === "running") {
    const pace = paceSecondsPerKm(actual.distance.metres, actual.durationMs);
    if (pace !== null)
      stats.push({ label: "Pace", figure: split(`${formatPaceSeconds(pace)} /km`) });
  }
  if (actual?.sport === "cycling") {
    const speed = speedMetresPerSecond(metres, actual.durationMs);
    if (speed !== null)
      stats.push({
        label: "Average",
        figure: split(formatSpeed(speed, actual.distance?.unit === "mi" ? "mi" : "km")),
      });
  }
  if (actual?.sport === "swimming") {
    const unit = actual.poolLength?.unit === "yd" ? "yd" : "m";
    const pace = swimPaceSecondsPer100(actual, unit);
    if (pace !== null)
      stats.push({ label: "Pace", figure: split(`${formatPaceSeconds(pace, 1)} /100 ${unit}`) });
  }
  stats.push({ label: "Effort", figure: { value: describeEffort(activity.effort) } });

  const where = actual ? ENVIRONMENT_LABELS[actual.environment] : undefined;
  const recorded = details(actual);

  return (
    <>
      <PageHeader
        title={activity.title ?? ACTIVITY_SPORT_LABELS[activity.sport]}
        meta={formatDateTime(activity.startedAt, profile.timeZone)}
        backHref="/progress/history"
      />
      <PageContent>
        <HeroCard tone={tone}>
          <div className="flex items-start justify-between gap-3">
            <p className="flex min-h-7 min-w-0 items-center gap-2 text-sm font-semibold text-ink-muted">
              <Icon aria-hidden />
              {ACTIVITY_SPORT_LABELS[activity.sport]}
              {where ? `, ${where}` : ""}
            </p>
            {activity.outcome === "ended_early" && <Badge tone="accent">Ended early</Badge>}
          </div>
          <div>
            {figure ? (
              <p className="tabular-nums">
                <span className="font-display text-display-xl font-extrabold">{figure.value}</span>
                {figure.unit && (
                  <>
                    {" "}
                    <span className="text-xl font-semibold">{figure.unit}</span>
                  </>
                )}
              </p>
            ) : (
              <p className="font-display text-display-m font-extrabold">Not timed</p>
            )}
            {timeIsHeadline && (
              <p className="mt-1 text-callout text-ink-muted">No distance recorded</p>
            )}
            {activity.origin.kind === "planned" && (
              <p className="mt-1 text-callout text-ink-muted">Answered a scheduled session</p>
            )}
          </div>
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(6rem,1fr))] gap-x-4 gap-y-3 border-t border-line pt-4">
            {stats.map((stat) => (
              <div key={stat.label} className="min-w-0">
                <dt className="text-sm font-semibold text-ink-muted">{stat.label}</dt>
                <dd className="mt-0.5 tabular-nums">
                  <span className="font-display text-display-s font-extrabold">
                    {stat.figure.value}
                  </span>
                  {stat.figure.unit && (
                    <>
                      {" "}
                      <span className="text-sm font-semibold">{stat.figure.unit}</span>
                    </>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          {actual?.sport === "swimming" && actual.activeMs === null && (
            <p className="text-sm text-ink-muted">
              Elapsed time only, so there is no swimming pace for this one.
            </p>
          )}
        </HeroCard>

        {recorded.length > 0 && (
          <dl className="box-rows">
            {recorded.map(([label, value]) => (
              <div
                key={label}
                className="flex min-h-12 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-3"
              >
                <dt className="text-sm text-ink-muted">{label}</dt>
                <dd className="font-semibold [overflow-wrap:anywhere] tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {activity.notes && (
          <Card>
            <h2 className="text-headline font-semibold">Notes</h2>
            <p className="[overflow-wrap:anywhere] whitespace-pre-wrap">{activity.notes}</p>
          </Card>
        )}

        <div className="space-y-2">
          <LinkButton
            href={`/training/activities/${activity.id}/edit${originQuery(origin)}`}
            variant="secondary"
            tone={tone}
            className="w-full"
          >
            Correct this activity
          </LinkButton>
          <DeleteActivityButton
            activityId={activity.id}
            settlesOccurrence={activity.origin.kind === "planned"}
          />
        </div>
      </PageContent>
    </>
  );
}
