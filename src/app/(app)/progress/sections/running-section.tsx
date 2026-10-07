"use client";

import { Graph, type GraphReadout } from "@/components/graph/graph";
import {
  activityHref,
  bucketLabel,
  counted,
  dayHref,
  dayLabel,
  decimal,
  historyHref,
} from "@/components/graph/labels";
import { thinRecords } from "@/components/graph/thin";
import { useUrlChoice } from "@/components/graph/use-url-choice";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { formatDuration, formatPace } from "@/domain/pace";
import { averagePace, type RunBucket } from "@/domain/progress-graphs";
import { formatMinutes } from "@/lib/format";

import type { ProgressData } from "../progress-types";

const METRICS = [
  { value: "distance", label: "Distance" },
  { value: "pace", label: "Pace" },
  { value: "duration", label: "Duration" },
] as const;
type RunMetric = (typeof METRICS)[number]["value"];

const PLACES = [
  { value: "outdoor", label: "Outdoor" },
  { value: "treadmill", label: "Treadmill" },
] as const;
type Place = (typeof PLACES)[number]["value"];

/** Minutes a duration scale may step by: a quarter, a half, an hour… */
const MINUTE_STEPS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480, 600, 900, 1200];
/** Seconds a pace scale may step by. */
const PACE_STEPS = [5, 10, 15, 20, 30, 60, 120, 300];

const km = (metres: number) => decimal(metres / 1000);

/**
 * Running (ADR 0042): distance and time as totals, a bar per day, week or month, and pace as
 * a line, a point per run, faster higher. Outdoor and treadmill paces are never one line.
 */
export function RunningSection({ running, today }: Pick<ProgressData, "running" | "today">) {
  const { range, graph, truncated } = running;
  const [metric, setMetric] = useUrlChoice<RunMetric>(
    "run",
    METRICS.map((m) => m.value),
    "distance",
  );
  const places = PLACES.filter((place) =>
    graph.points.some((point) => point.environment === place.value && point.pace !== null),
  );
  const [place, setPlace] = useUrlChoice<Place>(
    "where",
    places.map((option) => option.value),
    places[0]?.value ?? "outdoor",
  );

  /** A bucket of runs, as its readout names it and the record it opens. */
  const bucketReadout = (
    bucket: RunBucket,
    figure: GraphReadout["figure"],
    unit?: string,
    context?: string,
  ): GraphReadout => {
    const label = bucketLabel(bucket, range.bucket, today);
    if (bucket.runs === 0) return { label, figure: null, context: "No runs" };
    return {
      label,
      figure,
      unit,
      context,
      ...(bucket.runId
        ? { href: activityHref(bucket.runId, "history"), action: "Open run" }
        : range.bucket === "day"
          ? { href: dayHref(bucket.start), action: "Open day" }
          : {
              href: historyHref(bucket.start, bucket.end, "run"),
              action: range.bucket === "week" ? "Open week" : "Open month",
            }),
    };
  };

  const paced = graph.points.filter((point) => point.environment === place && point.pace !== null);
  const average = averagePace(paced);
  // Past about sixty runs, a point per week or month: the pace of all its kilometres together.
  const paceLine = thinRecords(
    paced.map((point) => ({ date: point.date, value: point.pace })),
    range,
    { reduce: "mean", weights: paced.map((point) => point.metres) },
  );

  return (
    <div className="mt-3 space-y-3">
      <SegmentedControl
        name="run-metric"
        aria-label="Running measure"
        options={METRICS}
        value={metric}
        onChange={setMetric}
        columns={3}
      />
      {truncated && (
        <p role="status" className="type-meta text-ink-2">
          Over 5,000 runs: the oldest are left out of these graphs.
        </p>
      )}
      {metric === "distance" && (
        <Graph
          name="Distance"
          mark="bar"
          placement="bucket"
          range={range}
          data={graph.buckets.map((bucket) => ({
            date: bucket.start,
            value: bucket.runs > 0 ? bucket.metres / 1000 : null,
          }))}
          format={(value) => decimal(value)}
          summary={{
            label: "Total distance",
            figure: graph.totals.runs > 0 ? km(graph.totals.metres) : null,
            unit: "km",
            context: graph.totals.runs > 0 ? counted(graph.totals.runs, "run") : null,
          }}
          describe={(index) => {
            const bucket = graph.buckets[index]!;
            return bucketReadout(
              bucket,
              km(bucket.metres),
              "km",
              `${counted(bucket.runs, "run")} · ${formatMinutes(bucket.seconds / 60)}`,
            );
          }}
          empty="No runs in this range."
        />
      )}
      {metric === "duration" && (
        <Graph
          name="Duration"
          mark="bar"
          placement="bucket"
          range={range}
          data={graph.buckets.map((bucket) => ({
            date: bucket.start,
            value: bucket.runs > 0 ? bucket.seconds / 60 : null,
          }))}
          format={(minutes) => (minutes >= 60 ? `${decimal(minutes / 60)}h` : `${minutes}m`)}
          scale={{ steps: MINUTE_STEPS }}
          summary={{
            label: "Total time",
            figure: graph.totals.runs > 0 ? formatMinutes(graph.totals.seconds / 60) : null,
            context: graph.totals.runs > 0 ? counted(graph.totals.runs, "run") : null,
          }}
          describe={(index) => {
            const bucket = graph.buckets[index]!;
            return bucketReadout(
              bucket,
              formatMinutes(bucket.seconds / 60),
              undefined,
              `${counted(bucket.runs, "run")} · ${km(bucket.metres)} km`,
            );
          }}
          empty="No runs in this range."
        />
      )}
      {metric === "pace" && (
        <>
          {/* Only where both were run: a treadmill's pace is not the road's. */}
          {places.length > 1 && (
            <SegmentedControl
              name="pace-place"
              aria-label="Where"
              options={places}
              value={place}
              onChange={setPlace}
              columns={2}
            />
          )}
          <Graph
            name={`${place === "outdoor" ? "Outdoor" : "Treadmill"} pace`}
            mark="line"
            placement="record"
            range={range}
            data={paceLine.points}
            format={formatPace}
            scale={{ invert: true, steps: PACE_STEPS }}
            summary={{
              label: "Average pace",
              figure: average === null ? null : formatPace(average),
              unit: "/km",
              context:
                paced.length > 0
                  ? counted(paced.length, place === "outdoor" ? "outdoor run" : "treadmill run")
                  : null,
            }}
            describe={(index) => {
              const group = paceLine.groups[index]!;
              if (paceLine.bucket) {
                const runs = group.indices.map((i) => paced[i]!);
                return {
                  label: bucketLabel(
                    { start: group.start, end: group.end, partial: group.end >= today },
                    paceLine.bucket,
                    today,
                  ),
                  figure: formatPace(paceLine.points[index]!.value),
                  unit: "/km",
                  context: `Average of ${counted(runs.length, "run")} · ${km(
                    runs.reduce((sum, run) => sum + run.metres, 0),
                  )} km`,
                  href: historyHref(group.start, group.end, "run"),
                  action: paceLine.bucket === "week" ? "Open week" : "Open month",
                };
              }
              const point = paced[group.indices[0]!]!;
              return {
                label: dayLabel(point.date, today),
                figure: formatPace(point.pace),
                unit: "/km",
                context: `${km(point.metres)} km · ${formatDuration(point.seconds)}`,
                href: activityHref(point.id, "history"),
                action: "Open run",
              };
            }}
            note={{
              label: "About pace",
              content:
                "Each run's average pace, time over distance; faster is higher. The average is the runs' total time over their total distance, so a long run counts for every kilometre of it.",
            }}
            empty="No runs with a pace in this range."
          />
        </>
      )}
    </div>
  );
}
