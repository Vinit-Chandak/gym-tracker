"use client";

import type { Route } from "next";

import type { GraphRange } from "@/domain/graph-range";
import { formatDuration } from "@/domain/pace";
import { METRIC_UNIT, type SharedMetric } from "@/domain/shared-stats";
import type { BodyLoadUnit } from "@/domain/types";

import { Graph, type GraphSide } from "./graph";
import { bucketLabel, dayLabel, decimal } from "./labels";
import { pairLines } from "./thin";

/** One workout's value on a head-to-head line, in the reader's unit, and where it opens. */
export type HeadToHeadPoint = { date: string; value: number; href: Route | null };

export type HeadToHeadData = {
  range: GraphRange;
  today: string;
  metric: SharedMetric;
  /** The metric as this movement names it: "Est. 1RM", "Most reps". */
  label: string;
  unit: BodyLoadUnit;
  /** The viewer's name and the friend's, their lines in that order. */
  names: readonly [string, string];
  lines: readonly [readonly HeadToHeadPoint[], readonly HeadToHeadPoint[]];
};

/** Seconds a hold's scale may step by, so its labels read as a clock does. */
const SECOND_STEPS = [5, 10, 15, 20, 30, 60, 120, 300, 600];

/** What each line's best in the span is called over the readout, and a point in the note. */
const BEST: Partial<Record<SharedMetric, { label: string; point: string }>> = {
  e1rm: { label: "Best estimated 1RM", point: "best estimated 1RM" },
  most_reps: { label: "Most reps in a set", point: "most reps in a set" },
  longest_hold: { label: "Longest hold", point: "longest hold" },
  longest_carry: { label: "Longest carry", point: "longest carry" },
};

/**
 * One movement head to head (ADR 0042): the viewer's line in ink and the friend's in grey on
 * the shared graph, a point per workout that opens it (the viewer's own workout, the friend's
 * shared session). Its summary is each person's best in the span.
 */
export function HeadToHeadGraph({ data }: { data: HeadToHeadData }) {
  const { range, today, metric, label, unit, names, lines } = data;
  const counted = METRIC_UNIT[metric];
  const best = BEST[metric] ?? { label, point: label.toLowerCase() };
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
      name={`${best.label}, ${names[0]} and ${names[1]}`}
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
        label: best.label,
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
