import { Card } from "@/components/ui/card";
import { DetailList } from "@/components/ui/detail-list";
import { formatDuration, formatPace } from "@/domain/pace";
import { formatIsoDate, formatRunKm, formatSharedLoad } from "@/lib/format";
import type { BodyLoadUnit } from "@/domain/types";
import { SPORT_LABELS, type TrainingSport } from "@/domain/sport-scope";
import type { SharedActivityDetail } from "@/server/repositories/shared-stats";

/**
 * What a follower sees of one session (plan §9.2).
 *
 * The shape of this component is the privacy rule made visible: it takes a shared row and
 * nothing else. There is no activity here to accidentally read a note, an effort, a heart
 * rate, a pool or a named bike from — those never left the owner's account, and a component
 * that cannot reach them cannot leak them (AT-PRIV-02).
 *
 * Cycling and swimming deliberately show less than running. A ride's pace depends on whether
 * the bike was assisted and whether the ride was indoors; a swim's depends on a time basis
 * nobody else can see. Publishing either as a bare number would invite a comparison the data
 * does not support, so it is not published at all this release.
 */
export function ActivitySummary({
  activity,
  unit,
}: {
  activity: SharedActivityDetail;
  unit: BodyLoadUnit;
}) {
  return (
    <Card>
      <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">
        {SPORT_LABELS[activity.sport as TrainingSport]}
      </p>
      <h1 className="mt-1 text-lg font-medium [overflow-wrap:anywhere]">{activity.title}</h1>
      <p className="mt-1 text-sm text-ink-muted tabular-nums">
        {formatIsoDate(activity.occurredOn)}
      </p>
      <div className="mt-3">
        <DetailList entries={entries(activity, unit)} />
      </div>
    </Card>
  );
}

function entries(
  activity: SharedActivityDetail,
  unit: BodyLoadUnit,
): readonly (readonly [string, string | null])[] {
  const duration: readonly [string, string | null] = [
    "Time",
    activity.durationSeconds > 0 ? formatDuration(activity.durationSeconds) : null,
  ];
  switch (activity.sport) {
    case "workout":
      return [
        duration,
        ["Working sets", activity.workingSets > 0 ? String(activity.workingSets) : null],
        ["Volume", activity.volumeKg > 0 ? formatSharedLoad(activity.volumeKg, unit) : null],
      ];
    case "run":
      return [
        [
          "Distance",
          activity.distanceMeters === null ? null : formatRunKm(activity.distanceMeters),
        ],
        duration,
        [
          "Average pace",
          activity.paceSecondsPerKm === null
            ? null
            : `${formatPace(activity.paceSecondsPerKm)} /km`,
        ],
      ];
    case "cycle":
    case "swim":
      return [
        [
          "Distance",
          activity.distanceMeters === null ? null : formatRunKm(activity.distanceMeters),
        ],
        duration,
      ];
  }
}
