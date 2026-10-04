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
 * The records a finished workout set (plan §3.13; boards Summary, Past workout): a list in ink,
 * the exercise, the metric and what it was, the new figure trailing, in the reader's unit. On
 * the workout's page, so it is there whenever the workout is reopened and not only in the
 * moment.
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
    <section aria-labelledby="session-records">
      <h2 id="session-records" className="caption-head mt-4.5">
        {records.length === 1 ? "1 record" : `${records.length} records`}
      </h2>
      <ul>
        {records.map((record) => {
          const [figure, ...rest] = formatSharedMetric(record.metric, record.value, unit).split(
            " ",
          );
          return (
            <li key={`${record.exerciseId}:${record.metric}`} className="figure-row">
              <span className="figure-row-text">
                <Link
                  href={`/exercises/${record.exerciseId}`}
                  className="record-row-name underline-offset-4 hover:underline"
                >
                  {record.exercise.name}
                </Link>{" "}
                <span className="figure-row-meta">
                  {metricLabel(record.metric, record.exercise)} · was{" "}
                  {formatSharedMetric(record.metric, record.previous, unit)}
                </span>
              </span>{" "}
              <span className="figure-row-value">
                <span className="type-figure">{figure}</span>
                {rest.length > 0 && <span className="figure-row-unit"> {rest.join(" ")}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
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
      <h2 className="text-base font-medium">Your records</h2>
      <StatTileRow>
        {bests.map((best) => (
          <StatTile
            key={best.metric}
            label={metricLabel(best.metric, exercise)}
            value={
              <>
                {formatSharedMetric(best.metric, best.value, unit)}
                <span className="mt-0.5 block text-xs font-normal text-ink-muted">
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
    <ul className="divide-y divide-line text-sm">
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
          <span className="font-medium tabular-nums">
            {formatSharedMetric(record.metric, record.value, unit)}
          </span>
        </li>
      ))}
    </ul>
  );
}
