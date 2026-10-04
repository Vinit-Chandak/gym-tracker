import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";

import { Art } from "@/components/art/art";
import { BackLink } from "@/components/shell/back-link";
import { FitTitle } from "@/components/ui/fit-title";
import { Glyph, type GlyphName } from "@/components/ui/glyphs";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORT_LABELS, describeEffort } from "@/domain/activity";
import {
  actualDistanceMetres,
  formatPaceSeconds,
  formatSpeed,
  paceSecondsPerKm,
  speedMetresPerSecond,
  swimPaceSecondsPer100,
} from "@/domain/activity-metrics";
import { formatDuration } from "@/domain/pace";
import { formatDistance } from "@/lib/distance-units";
import { formatDateTime } from "@/lib/format";
import { ORIGIN_PARAM, originQuery, parseOrigin } from "@/lib/nav";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { getActivity } from "@/server/repositories/activities";
import { requireUuid } from "@/server/validation/params";

import { ActivityMore } from "./activity-more";

export const metadata: Metadata = { title: "Activity" };

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

type Stat = { label: string; figure: string; unit?: string };

/**
 * One logged activity, whatever sport it is (board Run): its print in full ink, its name, when
 * and where, then what it recorded two by two, and its notes. Correcting and deleting it are
 * behind More.
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
  const stats: Stat[] = [
    {
      label: "Distance",
      ...(metres === null ? { figure: "—" } : split(formatDistance(metres, "km"))),
    },
    {
      label: "Time",
      figure: activity.durationMs === null ? "—" : formatDuration(activity.durationMs / 1000),
    },
  ];
  if (actual?.sport === "running")
    stats.push({
      label: "Pace",
      figure: formatPaceSeconds(paceSecondsPerKm(actual.distance.metres, actual.durationMs)),
      unit: "/km",
    });
  if (actual?.sport === "cycling")
    stats.push({
      label: "Speed",
      ...split(formatSpeed(speedMetresPerSecond(metres, actual.durationMs))),
    });
  if (actual?.sport === "swimming") {
    const yards = actual.poolLength?.unit === "yd";
    const pace = swimPaceSecondsPer100(actual, yards ? "yd" : "m");
    stats.push({
      label: "Pace",
      figure: pace === null ? "—" : formatPaceSeconds(pace, 1),
      unit: yards ? "/100 yd" : "/100 m",
    });
  }
  stats.push({ label: "Effort", figure: describeEffort(activity.effort) });

  const sport = activity.sport === "strength" ? null : activity.sport;
  const title = activity.title ?? ACTIVITY_SPORT_LABELS[activity.sport];
  const where = actual ? WHERE[actual.environment] : undefined;

  return (
    <>
      <header className="page-header page-width pt-safe">
        <div className="page-header-bar">
          <BackLink fallback="/progress/history" />
          <div className="page-header-action">
            <ActivityMore
              label={`Correct or delete this ${sport ? NOUN[sport] : "activity"}`}
              title={title}
              editHref={`/training/activities/${activity.id}/edit${originQuery(origin)}` as Route}
              activityId={activity.id}
              settlesOccurrence={activity.origin.kind === "planned"}
            />
          </div>
        </div>
      </header>
      <div className="page-width pb-8">
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
        <p className="meta-line mt-1">
          <span className="meta-fact">
            <Glyph name="calendar" label="Date" className="glyph-16" />
            {formatDateTime(activity.startedAt, profile.timeZone)}
          </span>
          {where && (
            <span className="meta-fact">
              <Glyph name={where.glyph} className="glyph-16" />
              {where.label}
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
              </dd>
            </div>
          ))}
        </dl>

        {activity.origin.kind === "planned" && (
          <p className="mt-3 type-meta text-ink-2">This answered a scheduled session.</p>
        )}
        {actual?.sport === "swimming" && actual.activeMs === null && (
          <p className="mt-3 type-meta text-ink-2">
            Elapsed time only, so there is no swimming pace for this one.
          </p>
        )}
        {activity.notes && (
          <p className="mt-3.5 type-body [overflow-wrap:anywhere] whitespace-pre-wrap">
            {activity.notes}
          </p>
        )}
      </div>
    </>
  );
}
