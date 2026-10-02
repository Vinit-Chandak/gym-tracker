import { StatTile, StatTileRow } from "@/components/ui/stat-tile";
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
  const shown = entries(activity, unit).filter(
    (entry): entry is readonly [string, string] => Boolean(entry[1]),
  );
  return (
    <section className="box space-y-4 py-4">
      <div className="min-w-0">
        <h1 className="text-2xl [overflow-wrap:anywhere]">{activity.title}</h1>
        <p className="mt-1 text-sm text-ink-muted tabular-nums">
          {SPORT_LABELS[activity.sport as TrainingSport]} · {formatIsoDate(activity.occurredOn)}
        </p>
      </div>
      {shown.length > 0 && (
        <StatTileRow>
          {shown.map(([label, value]) => (
            <StatTile key={label} label={label} value={value} />
          ))}
        </StatTileRow>
      )}
    </section>
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
