"use client";

import { Graph } from "@/components/graph/graph";
import { bucketLabel, counted, dayLabel, decimal } from "@/components/graph/labels";
import { thinRecords } from "@/components/graph/thin";

import type { ProgressData } from "../progress-types";

/** "+1.4", "−0.6", "0": a change in body weight, signed, to a tenth. */
const change = (value: number) => {
  const rounded = Math.round(value * 10) / 10;
  return rounded > 0 ? `+${decimal(rounded)}` : rounded < 0 ? `−${decimal(-rounded)}` : "0";
};

/**
 * Body weight (ADR 0042, ADR 0046): as recorded, a point per reading, the latest the summary.
 * The muscles a week trained are a section of their own.
 */
export function BodyWeightSection({ body, today }: Pick<ProgressData, "body" | "today">) {
  const { range, points, unit } = body;
  const first = points[0];
  const last = points.at(-1);
  // Past about sixty readings, a point per week or month: their average.
  const line = thinRecords(points, range, { reduce: "mean" });

  return (
    <div className="mt-3">
      <Graph
        name="Body weight"
        mark="line"
        placement="record"
        range={range}
        data={line.points}
        format={(value) => decimal(value)}
        summary={{
          label: "Latest",
          figure: last ? decimal(last.value) : null,
          unit,
          context:
            first && last && points.length > 1
              ? `${change(last.value - first.value)} since ${dayLabel(first.date, today)}`
              : last
                ? dayLabel(last.date, today)
                : null,
        }}
        describe={(index) => {
          const group = line.groups[index]!;
          if (line.bucket)
            return {
              label: bucketLabel(
                { start: group.start, end: group.end, partial: group.end >= today },
                line.bucket,
                today,
              ),
              figure: decimal(line.points[index]!.value!),
              unit,
              context: `Average of ${counted(group.indices.length, "reading")}`,
            };
          const point = points[group.indices[0]!]!;
          const before = points[group.indices[0]! - 1];
          return {
            label: dayLabel(point.date, today),
            figure: decimal(point.value),
            unit,
            context: before
              ? `${change(point.value - before.value)} since ${dayLabel(before.date, today)}`
              : "First reading in this range",
          };
        }}
        note={{
          label: "About body weight",
          content:
            "One reading a day: the weight given when a workout is finished, or set from Profile → Edit profile. A second reading on the same day replaces the first.",
        }}
        empty="No readings in this range. Weight given when you finish a workout appears here, and you can set it any day from Profile → Edit profile."
      />
    </div>
  );
}
