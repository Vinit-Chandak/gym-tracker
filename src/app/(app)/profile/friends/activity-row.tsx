import { Art } from "@/components/art/art";
import Link from "@/components/ui/app-link";
import { Avatar } from "@/components/ui/avatar";
import { formatDuration } from "@/domain/pace";
import type { TrainingSport } from "@/domain/sport-scope";
import type { BodyLoadUnit } from "@/domain/types";
import { joinFacts } from "@/lib/facts";
import {
  formatRelativeDay,
  formatSharedDistance,
  formatSharedLoad,
  formatSharedPace,
  type SharedDistanceUnits,
} from "@/lib/format";
import type { ActivityRow as Activity } from "@/server/repositories/shared-stats";

/**
 * What one shared session says of itself, by sport, distances in the reader's own unit for
 * it. Exhaustive on purpose: a sport added later has to say what its row reads before it can
 * appear here.
 */
function summary(row: Activity, unit: BodyLoadUnit, distanceUnits: SharedDistanceUnits): string[] {
  const sport: TrainingSport = row.sport;
  switch (sport) {
    case "workout": {
      const parts = [
        row.title,
        `${row.workingSets}\u00a0${row.workingSets === 1 ? "set" : "sets"}`,
        formatSharedLoad(row.volumeKg, unit),
      ];
      if (row.records > 0)
        parts.push(`${row.records}\u00a0${row.records === 1 ? "record" : "records"}`);
      return parts;
    }
    case "run":
      return [
        row.title,
        formatSharedDistance(row.distanceMeters ?? 0, distanceUnits.run),
        formatDuration(row.durationSeconds),
        formatSharedPace(row.paceSecondsPerKm, distanceUnits.run),
      ];
    // A shared ride or swim says it happened, how long it took, and how far where a distance
    // is known. No pace: without the environment, the assistance or the pool it would be a
    // number pretending to be comparable (SOCIAL-01, AT-PRIV-02).
    case "cycle":
    case "swim":
      return [
        row.title,
        row.distanceMeters === null
          ? null
          : formatSharedDistance(row.distanceMeters, distanceUnits[sport]),
        formatDuration(row.durationSeconds),
      ].filter((part): part is string => part !== null);
  }
}

/** Each shared sport's form, as its mark beside the line. */
const MARK: Record<TrainingSport, "strength" | "run" | "ride" | "swim"> = {
  workout: "strength",
  run: "run",
  cycle: "ride",
  swim: "swim",
};

/**
 * One line of recent activity (plan §3.4; board Friends): who, when, and what, led by the
 * sport's mark, opening the person's page. Nothing here can be reacted to.
 */
export function ActivityRow({
  row,
  unit,
  distanceUnits,
  today,
}: {
  row: Activity;
  unit: BodyLoadUnit;
  distanceUnits: SharedDistanceUnits;
  today: string;
}) {
  const { person } = row;
  // A session keeps its owner's local date, which a friend ahead of the reader's time zone
  // can have on the reader's tomorrow: it happened today all the same, not on a weekday to come.
  const day = row.occurredOn > today ? today : row.occurredOn;
  return (
    // The shared row's own id, never the activity's: a raw id names a private record, and a
    // link is a place where guessing one would be easiest (AT-PRIV-04).
    <Link
      href={`/u/${person.username}/activities/${row.id}`}
      prefetch="intent"
      className="activity-row"
    >
      <Avatar
        username={person.username}
        displayName={person.displayName}
        size="row"
        className="activity-row-avatar"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className="activity-row-name">{person.displayName || person.username}</span>
          <span className="activity-row-day">{formatRelativeDay(day, today)}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="grid w-4 shrink-0 justify-items-center">
            <Art kind="mark" sport={MARK[row.sport]} size={16} />
          </span>
          <span className="activity-row-text">{joinFacts(summary(row, unit, distanceUnits))}</span>
        </span>
      </span>
    </Link>
  );
}
