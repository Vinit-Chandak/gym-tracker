import { Art } from "@/components/art/art";
import Link from "@/components/ui/app-link";
import { Avatar } from "@/components/ui/avatar";
import { formatDuration, formatPace } from "@/domain/pace";
import type { TrainingSport } from "@/domain/sport-scope";
import type { BodyLoadUnit } from "@/domain/types";
import { formatRelativeDay, formatRunKm, formatSharedLoad } from "@/lib/format";
import type { ActivityRow as Activity } from "@/server/repositories/shared-stats";

/**
 * What one shared session says of itself, by sport. Exhaustive on purpose: a sport added
 * later has to say what its row reads before it can appear here.
 */
function summary(row: Activity, unit: BodyLoadUnit): string[] {
  const sport: TrainingSport = row.sport;
  switch (sport) {
    case "workout": {
      const parts = [
        row.title,
        `${row.workingSets} ${row.workingSets === 1 ? "set" : "sets"}`,
        formatSharedLoad(row.volumeKg, unit),
      ];
      if (row.records > 0) parts.push(`${row.records} ${row.records === 1 ? "record" : "records"}`);
      return parts;
    }
    case "run":
      return [
        row.title,
        `${formatRunKm(row.distanceMeters ?? 0)} km`,
        formatDuration(row.durationSeconds),
        `${formatPace(row.paceSecondsPerKm)} /km`,
      ];
    // A shared ride or swim says it happened, how long it took, and how far where a distance
    // is known. No pace: without the environment, the assistance or the pool it would be a
    // number pretending to be comparable (SOCIAL-01, AT-PRIV-02).
    case "cycle":
    case "swim":
      return [
        row.title,
        row.distanceMeters === null ? null : `${formatRunKm(row.distanceMeters)} km`,
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
  today,
}: {
  row: Activity;
  unit: BodyLoadUnit;
  today: string;
}) {
  const { person } = row;
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
          <span className="activity-row-day">{formatRelativeDay(row.occurredOn, today)}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="grid w-4 shrink-0 justify-items-center">
            <Art kind="mark" sport={MARK[row.sport]} size={16} />
          </span>
          <span className="activity-row-text">{summary(row, unit).join(" · ")}</span>
        </span>
      </span>
    </Link>
  );
}
