import Link from "@/components/ui/app-link";
import { Card } from "@/components/ui/card";
import { Trophy } from "@/components/ui/icons";
import { StatTile, StatTileRow } from "@/components/ui/stat-tile";
import { metricLabel, type MetricExercise } from "@/domain/shared-stats";
import type { BodyLoadUnit } from "@/domain/types";
import { formatIsoDay, formatSharedMetric, formatTopWeightWork } from "@/lib/format";
import type {
  ExerciseBest,
  PeriodRecord,
  RecordWithExercise,
} from "@/server/repositories/shared-stats";

/**
 * "88 kg": the figure in the display face and its unit small beside it, the way every record
 * on these screens is read. A figure with no unit ("1:30") is the figure alone.
 */
function RecordFigure({ text }: { text: string }) {
  const [value, ...unit] = text.split(" ");
  return (
    <span className="shrink-0 text-right tabular-nums">
      <span className="font-display text-display-s font-extrabold">{value}</span>
      {unit.length > 0 && (
        <>
          {" "}
          <span className="text-sm font-semibold text-ink-muted">{unit.join(" ")}</span>
        </>
      )}
    </span>
  );
}

/**
 * The records a finished workout set (plan §3.13): one row per record, the movement and what
 * it was measured by, with the new figure large beside it and the old one under the name, in
 * the reader's unit. On the workout's page, so it is there whenever the workout is reopened
 * and not only in the moment.
 */
export function SessionRecordsCard({
  records,
  unit,
}: {
  records: readonly RecordWithExercise[];
  unit: BodyLoadUnit;
}) {
  if (records.length === 0) return null;
  return (
    <Card>
      <h2 className="flex items-center gap-3 text-headline font-semibold">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-control bg-lift-soft text-lift-ink"
        >
          <Trophy />
        </span>
        {records.length === 1 ? "1 record" : `${records.length} records`}
      </h2>
      <ul className="ruled-list">
        {records.map((record) => (
          <li
            key={`${record.exerciseId}:${record.metric}`}
            className="flex items-center justify-between gap-3 py-3 last:pb-0"
          >
            <span className="min-w-0">
              <Link
                href={`/exercises/${record.exerciseId}`}
                className="inline-flex min-h-11 items-center font-semibold [overflow-wrap:anywhere] underline-offset-2 hover:underline"
              >
                {record.exercise.name}
              </Link>
              <span className="-mt-1.5 block text-sm [overflow-wrap:anywhere] text-ink-muted tabular-nums">
                {metricLabel(record.metric, record.exercise)}, was{" "}
                {formatSharedMetric(record.metric, record.previous, unit)}
              </span>
            </span>
            <RecordFigure text={formatSharedMetric(record.metric, record.value, unit)} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * "Your records" on an exercise page: the best of each metric the movement is measured by,
 * with the day it was set and, under the top weight, how it was worked ("4 × 12"). Tiles,
 * like the exercise's defaults above them.
 */
export function ExerciseBestsTiles({
  exercise,
  bests,
  unit,
}: {
  exercise: MetricExercise;
  bests: readonly ExerciseBest[];
  unit: BodyLoadUnit;
}) {
  if (bests.length === 0) return null;
  return (
    <Card>
      <h2 className="text-headline font-semibold">Your records</h2>
      <StatTileRow>
        {bests.map((best) => (
          <StatTile
            key={best.metric}
            label={metricLabel(best.metric, exercise)}
            value={
              <>
                {formatSharedMetric(best.metric, best.value, unit)}
                <span className="mt-0.5 block font-sans text-xs font-normal text-ink-muted">
                  {best.work ? `${formatTopWeightWork(best.work)}, ` : ""}
                  {formatIsoDay(best.occurredOn)}
                </span>
              </>
            }
          />
        ))}
      </StatTileRow>
    </Card>
  );
}

/**
 * A person's Records for a period (plan §3.13): the best lifts by estimated 1RM, then the
 * other movements by what they are measured in. The same list on your own page as on a
 * friend's, in the reader's unit.
 */
export function PeriodRecordsList({
  records,
  unit,
}: {
  records: readonly PeriodRecord[];
  unit: BodyLoadUnit;
}) {
  return (
    <ul className="ruled-list">
      {records.map((record) => (
        <li
          key={record.exercise.id}
          className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
        >
          <span className="min-w-0">
            <span className="block font-semibold [overflow-wrap:anywhere]">
              {record.exercise.name}
            </span>
            <span className="block text-sm [overflow-wrap:anywhere] text-ink-muted tabular-nums">
              {metricLabel(record.metric, record.exercise)}, {formatIsoDay(record.occurredOn)}
            </span>
          </span>
          <RecordFigure text={formatSharedMetric(record.metric, record.value, unit)} />
        </li>
      ))}
    </ul>
  );
}
