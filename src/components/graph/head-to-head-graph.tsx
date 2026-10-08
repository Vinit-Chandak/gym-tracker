"use client";

import type { Route } from "next";

import { SegmentedControl } from "@/components/ui/segmented-control";
import type { GraphRange } from "@/domain/graph-range";
import { formatDuration } from "@/domain/pace";
import {
  METRIC_UNIT,
  metricLabel,
  type MetricExercise,
  type SharedMetric,
} from "@/domain/shared-stats";
import type { BodyLoadUnit } from "@/domain/types";

import { Graph, type GraphSide } from "./graph";
import { bucketLabel, dayLabel, decimal } from "./labels";
import { pairLines } from "./thin";
import { useUrlChoice } from "./use-url-choice";

/** One workout's value on a head-to-head line, in the reader's unit, and where it opens. */
export type HeadToHeadPoint = { date: string; value: number; href: Route | null };

/** One measure's two lines: the viewer's and the friend's, in that order. */
export type HeadToHeadMeasure = {
  metric: SharedMetric;
  lines: readonly [readonly HeadToHeadPoint[], readonly HeadToHeadPoint[]];
};

export type HeadToHeadData = {
  range: GraphRange;
  today: string;
  /** What the movement is measured by, so a pull-up's top weight reads as its added load. */
  exercise: MetricExercise;
  unit: BodyLoadUnit;
  /** The viewer's name and the friend's, their lines in that order. */
  names: readonly [string, string];
  /** Every metric the movement is measured by, its primary first. */
  measures: readonly HeadToHeadMeasure[];
};

/** Seconds a hold's scale may step by, so its labels read as a clock does. */
const SECOND_STEPS = [5, 10, 15, 20, 30, 60, 120, 300, 600];

/**
 * Each measure as an exercise's own graph names it (ADR 0042), in its order: its segment, its
 * name aloud, its summary over the readout and what one point is.
 */
const MEASURES: Record<SharedMetric, { short: string; long: string; best: string; point: string }> =
  {
    e1rm: {
      short: "e1RM",
      long: "Estimated 1RM",
      best: "Best estimated 1RM",
      point: "best estimated 1RM",
    },
    top_weight: {
      short: "Weight",
      long: "Max weight",
      best: "Heaviest set",
      point: "heaviest set",
    },
    most_reps: {
      short: "Reps",
      long: "Max reps",
      best: "Most reps in a set",
      point: "most reps in a set",
    },
    best_set_volume: {
      short: "Volume",
      long: "Max volume",
      best: "Biggest set, load × reps",
      point: "biggest set by load × reps",
    },
    longest_hold: { short: "Time", long: "Max time", best: "Longest hold", point: "longest hold" },
    longest_carry: {
      short: "Distance",
      long: "Max distance",
      best: "Longest carry",
      point: "longest carry",
    },
  };
const ORDER: readonly SharedMetric[] = [
  "e1rm",
  "top_weight",
  "most_reps",
  "best_set_volume",
  "longest_hold",
  "longest_carry",
];

/**
 * One movement head to head (ADR 0042, 0044): the viewer's line in ink and the friend's in grey
 * on the shared graph, a point per workout that opens it (the viewer's own workout, the friend's
 * shared session), by each measure an exercise's own graph offers that either of you has in the
 * span. Its summary is each person's best in the span.
 */
export function HeadToHeadGraph({ data }: { data: HeadToHeadData }) {
  const { measures } = data;
  const has = (measure: HeadToHeadMeasure) => measure.lines.some((line) => line.length > 0);
  const offered = ORDER.flatMap((metric) =>
    measures.filter((measure) => measure.metric === metric && has(measure)),
  );
  // The movement's primary metric while it has something to draw; else the first that does.
  const primary = measures[0];
  const fallback = primary && has(primary) ? primary.metric : (offered[0]?.metric ?? "e1rm");
  const [chosen, setChosen] = useUrlChoice<SharedMetric>(
    "measure",
    offered.map((measure) => measure.metric),
    fallback,
  );
  const measure = offered.find((m) => m.metric === chosen) ?? offered[0] ?? primary;
  const named = (metric: SharedMetric) => {
    // A pull-up's top weight is the load it added; a carry's, the heaviest carried.
    const own = metricLabel(metric, data.exercise);
    return metric === "top_weight" && own !== "Top weight"
      ? { ...MEASURES[metric], long: own, best: own, point: own.toLowerCase() }
      : MEASURES[metric];
  };

  return (
    <div className="space-y-3">
      {offered.length > 1 && (
        <SegmentedControl
          name="head-to-head-measure"
          aria-label="Measure"
          options={offered.map((m) => ({
            value: m.metric,
            label: named(m.metric).short,
            accessibleLabel: named(m.metric).long,
          }))}
          value={measure?.metric ?? fallback}
          onChange={setChosen}
          columns={offered.length}
        />
      )}
      {measure && (
        <MeasureGraph
          data={data}
          metric={measure.metric}
          lines={measure.lines}
          name={named(measure.metric)}
        />
      )}
    </div>
  );
}

function MeasureGraph({
  data,
  metric,
  lines,
  name: best,
}: {
  data: HeadToHeadData;
  metric: SharedMetric;
  lines: HeadToHeadMeasure["lines"];
  name: { best: string; point: string };
}) {
  const { range, today, unit, names } = data;
  const counted = METRIC_UNIT[metric];
  const figure = (value: number): Pick<GraphSide, "figure" | "unit"> => {
    switch (counted) {
      case "kg":
        return { figure: decimal(value), unit };
      case "reps":
        return { figure: String(value), unit: value === 1 ? "rep" : "reps" };
      case "seconds":
        return { figure: formatDuration(value) };
      case "metres":
        return { figure: decimal(value, 0), unit: "m" };
    }
  };

  // Past about sixty days, a point per week or month for both: each person's best in it.
  const pair = pairLines(lines[0], lines[1], range);
  const bestOf = (line: readonly HeadToHeadPoint[]) =>
    line.reduce<HeadToHeadPoint | null>(
      (top, point) => (top === null || point.value > top.value ? point : top),
      null,
    );
  const summarySide = (point: HeadToHeadPoint | null): GraphSide =>
    point
      ? { ...figure(point.value), context: dayLabel(point.date, today) }
      : { figure: null, context: "No sessions" };
  const markSide = (point: HeadToHeadPoint | null, action: string): GraphSide =>
    point
      ? {
          ...figure(point.value),
          // Grouped, the readout names the week; this says which day the best was.
          context: pair.bucket ? dayLabel(point.date, today) : null,
          ...(point.href ? { href: point.href, action } : {}),
        }
      : { figure: null, context: pair.bucket ? "No sessions" : "No session" };

  return (
    <Graph
      name={`${best.best}, ${names[0]} and ${names[1]}`}
      mark="line"
      placement="record"
      range={range}
      data={pair.points[0]}
      against={{ data: pair.points[1], names }}
      format={(value) =>
        counted === "seconds"
          ? formatDuration(value)
          : counted === "reps"
            ? String(value)
            : decimal(value, counted === "metres" || value >= 100 ? 0 : 1)
      }
      scale={{
        integral: counted === "reps",
        steps: counted === "seconds" ? SECOND_STEPS : undefined,
      }}
      summary={{
        label: best.best,
        ...summarySide(bestOf(lines[0])),
        against: summarySide(bestOf(lines[1])),
      }}
      describe={(index) => {
        const group = pair.groups[index]!;
        return {
          label: pair.bucket
            ? bucketLabel(
                { start: group.start, end: group.end, partial: group.end >= today },
                pair.bucket,
                today,
              )
            : dayLabel(group.start, today),
          ...markSide(group.picks[0], "Open workout"),
          against: markSide(group.picks[1], "Open session"),
        };
      }}
      note={{
        label: "About this graph",
        content: `One point per workout: its ${best.point}, warm-ups left out. Each line runs straight across the other person's training days rather than breaking there; over many workouts, a point is a week's or a month's best.`,
      }}
      empty="Neither of you did this in this range."
    />
  );
}
