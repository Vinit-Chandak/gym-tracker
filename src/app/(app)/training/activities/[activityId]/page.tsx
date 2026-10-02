import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SPORT_ICONS } from "@/components/activities/sport-icons";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { StatTile, StatTileRow } from "@/components/ui/stat-tile";
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

import { DeleteActivityButton } from "./delete-button";

export const metadata: Metadata = { title: "Activity" };

type Stat = { label: string; value: string };

/**
 * One logged activity, whatever sport it is.
 *
 * Each sport shows what it actually recorded and nothing more: a ride with no distance shows
 * no speed, a swim timed only end to end shows no pace, and an effort nobody confirmed says
 * so rather than passing for a report (plan §§4, 9.1). The measure the sport is about is the
 * largest thing on the sheet; the rest tabulate under it.
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
      label: "Time",
      value: activity.durationMs === null ? "—" : formatDuration(activity.durationMs / 1000),
    },
    { label: "Distance", value: metres === null ? "—" : formatDistance(metres, "km") },
  ];
  if (actual?.sport === "running") {
    stats.push({
      label: "/km",
      value: formatPaceSeconds(paceSecondsPerKm(actual.distance.metres, actual.durationMs)),
    });
  }
  if (actual?.sport === "cycling") {
    stats.push({
      label: "Speed",
      value: formatSpeed(speedMetresPerSecond(metres, actual.durationMs)),
    });
  }
  if (actual?.sport === "swimming") {
    const pace = swimPaceSecondsPer100(actual, actual.poolLength?.unit === "yd" ? "yd" : "m");
    stats.push({
      label: actual.poolLength?.unit === "yd" ? "/100 yd" : "/100 m",
      value: pace === null ? "—" : formatPaceSeconds(pace, 1),
    });
  }
  stats.push({ label: "Effort", value: describeEffort(activity.effort) });

  // The one giant measure: how far, for a sport that is about distance, and otherwise how
  // long. A ride or swim whose distance is unknown is still a record of its time.
  const headlineLabel =
    actual && (actual.sport === "running" || metres !== null) ? "Distance" : "Time";
  const headline = stats.find((stat) => stat.label === headlineLabel)!;
  const tiles = stats.filter((stat) => stat !== headline);
  const Icon = SPORT_ICONS[activity.sport];

  return (
    <>
      <PageHeader
        title={activity.title ?? ACTIVITY_SPORT_LABELS[activity.sport]}
        meta={formatDateTime(activity.startedAt, profile.timeZone)}
        backHref="/progress/history"
      />
      <PageContent>
        <section className="box space-y-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="flex min-w-0 items-center gap-2 text-lg font-semibold">
              <Icon scale="row" className="shrink-0 text-ink-muted" aria-hidden />
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {ACTIVITY_SPORT_LABELS[activity.sport]}
              </span>
            </h2>
            <Badge tone={activity.outcome === "ended_early" ? "warning" : "neutral"}>
              {activity.outcome === "ended_early" ? "Ended early" : "Logged"}
            </Badge>
          </div>

          <dl className="min-w-0">
            <dt className="text-xs text-ink-muted">{headline.label}</dt>
            <dd className="mt-1.5 measure text-3xl [overflow-wrap:anywhere]">{headline.value}</dd>
          </dl>

          <StatTileRow>
            {tiles.map((stat) => (
              <StatTile key={stat.label} label={stat.label} value={stat.value} />
            ))}
          </StatTileRow>

          {activity.origin.kind === "planned" && (
            <p className="text-sm text-ink-muted">This answered a scheduled session.</p>
          )}
          {actual?.sport === "swimming" && actual.activeMs === null && (
            <p className="text-sm text-ink-muted">
              Elapsed time only, so there is no swimming pace for this one.
            </p>
          )}
        </section>

        {activity.notes && (
          <section className="box space-y-2 py-4">
            <h2 className="text-lg font-semibold">Notes</h2>
            <p className="text-sm [overflow-wrap:anywhere] whitespace-pre-wrap">{activity.notes}</p>
          </section>
        )}

        <div className="space-y-2">
          <LinkButton
            href={`/training/activities/${activity.id}/edit${originQuery(origin)}`}
            variant="secondary"
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
