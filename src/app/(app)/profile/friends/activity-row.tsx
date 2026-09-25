import Link from "@/components/ui/app-link";
import { Avatar } from "@/components/ui/avatar";
import { ChevronRight } from "@/components/ui/icons";
import { PRESSABLE_ROW_CLASS } from "@/components/ui/link-row";
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

/**
 * One line of recent activity (plan §3.4): who, what, and when, opening the person's page.
 * Nothing here can be reacted to.
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
      className={PRESSABLE_ROW_CLASS}
    >
      <Avatar username={person.username} displayName={person.displayName} size="row" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline justify-between gap-x-2">
          <span className="font-medium [overflow-wrap:anywhere]">
            {person.displayName || person.username}
          </span>
          <span className="text-xs text-ink-muted">{formatRelativeDay(row.occurredOn, today)}</span>
        </span>
        <span className="block text-sm [overflow-wrap:anywhere] text-ink-muted tabular-nums">
          {summary(row, unit).join(" · ")}
        </span>
      </span>
      <ChevronRight className="shrink-0 text-ink-subtle" aria-hidden />
    </Link>
  );
}
