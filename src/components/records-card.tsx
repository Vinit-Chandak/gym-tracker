import Link from "@/components/ui/app-link";
import { Card } from "@/components/ui/card";
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
 * The records a finished workout set (plan §3.13): one ruled row per record, "Barbell bench
 * press · Est. 1RM 88 kg (was 85 kg)", the numbers in the data voice and in the reader's
 * unit. On the workout's page, so it is there whenever the workout is reopened and not only
 * in the moment.
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
      <h2 className="text-lg">{records.length === 1 ? "1 record" : `${records.length} records`}</h2>
      <ul className="min-w-0 text-sm ruled-list">
        {records.map((record) => (
          <li
            key={`${record.exerciseId}:${record.metric}`}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2"
          >
            <Link
              href={`/exercises/${record.exerciseId}`}
              className="min-w-0 font-medium [overflow-wrap:anywhere] text-pen underline-offset-2 hover:underline"
            >
              {record.exercise.name}
            </Link>
            <span className="font-data text-ink-muted tabular-nums">
              {metricLabel(record.metric, record.exercise)}{" "}
              <span className="font-semibold text-ink">
                {formatSharedMetric(record.metric, record.value, unit)}
              </span>{" "}
              (was {formatSharedMetric(record.metric, record.previous, unit)})
            </span>
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
      <h2 className="text-lg">Your records</h2>
      <StatTileRow>
        {bests.map((best) => (
          <StatTile
            key={best.metric}
            label={metricLabel(best.metric, exercise)}
            value={
              <>
                {formatSharedMetric(best.metric, best.value, unit)}
                <span className="mt-1 block font-sans text-xs leading-tight font-normal text-ink-muted">
                  {best.work ? `${formatTopWeightWork(best.work)} · ` : ""}
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
 * friend's, in the reader's unit, the value in the data voice at the end of the row.
 */
export function PeriodRecordsList({
  records,
  unit,
}: {
  records: readonly PeriodRecord[];
  unit: BodyLoadUnit;
}) {
  return (
    <ul className="min-w-0 text-sm ruled-list">
      {records.map((record) => (
        <li
          key={record.exercise.id}
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2"
        >
          <span className="min-w-0">
            <span className="block font-medium [overflow-wrap:anywhere]">
              {record.exercise.name}
            </span>
            <span className="block text-xs text-ink-muted">
              {metricLabel(record.metric, record.exercise)} · {formatIsoDay(record.occurredOn)}
            </span>
          </span>
          <span className="font-data text-base font-semibold tabular-nums">
            {formatSharedMetric(record.metric, record.value, unit)}
          </span>
        </li>
      ))}
    </ul>
  );
}
