"use client";

import { Graph } from "@/components/graph/graph";
import { bucketLabel, counted, dayLabel, decimal } from "@/components/graph/labels";
import { thinRecords } from "@/components/graph/thin";
import { LinkButton } from "@/components/ui/button";
import type { BodyLoadUnit } from "@/domain/types";

import type { ProgressData } from "../progress-types";

/**
 * "+1.4 kg", "−0.6 lb", "0 kg": a change in body weight, signed, to a tenth, and in its unit, so
 * it never reads as a bare number beside the figure's. The half rounds away from zero either way.
 */
const change = (value: number, unit: BodyLoadUnit) => {
  const tenths = Math.round(Math.abs(value) * 10) / 10;
  const sign = tenths === 0 ? "" : value > 0 ? "+" : "−";
  return `${sign}${decimal(tenths)}\u00a0${unit}`;
};

/**
 * Body weight (ADR 0042, ADR 0047): as recorded, a point per reading, the latest the summary.
 * The muscles a week trained are a section of their own. With no reading at all yet, the
 * section is its empty state, one line and the way to log the first (IA audit M8).
 */
export function BodyWeightSection({ body, today }: Pick<ProgressData, "body" | "today">) {
  const { range, points, unit } = body;
  const first = points[0];
  const last = points.at(-1);
  // Past about sixty readings, a point per week or month: their average.
  const line = thinRecords(points, range, { reduce: "mean" });

  if (!body.recorded && points.length === 0)
    return (
      <div className="mt-6">
        <h2 className="type-heading">No readings yet</h2>
        <LinkButton href="/today/log/body-weight" variant="tonal" className="mt-3">
          Log body weight
        </LinkButton>
      </div>
    );

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
              ? `${change(last.value - first.value, unit)} since ${dayLabel(first.date, today)}`
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
              ? `${change(point.value - before.value, unit)} since ${dayLabel(before.date, today)}`
              : "First reading in this range",
          };
        }}
        note={{
          label: "About body weight",
          content:
            "One reading a day: logged from Today › Log, or given when a workout is finished. A second that day replaces the first.",
        }}
        // Where a reading comes from is the ⓘ's to say.
        empty="No readings in this range."
      />
    </div>
  );
}
