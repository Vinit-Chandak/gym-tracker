"use client";

import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Graph } from "@/components/graph/graph";
import { bucketLabel, counted, dayLabel, decimal } from "@/components/graph/labels";
import { thinRecords } from "@/components/graph/thin";
import { BodyMap } from "@/components/ui/body-map";
import { Glyph } from "@/components/ui/glyphs";
import { InfoTip } from "@/components/ui/info-tip";
import { formatDateRange } from "@/lib/format";

import type { ProgressData } from "../progress-types";

/** "+1.4", "−0.6", "0": a change in body weight, signed, to a tenth. */
const change = (value: number) => {
  const rounded = Math.round(value * 10) / 10;
  return rounded > 0 ? `+${decimal(rounded)}` : rounded < 0 ? `−${decimal(-rounded)}` : "0";
};

/**
 * Body (ADR 0042): body weight as recorded, a point per reading, the latest the summary; then
 * the muscles a week trained, which steps a week at a time on its own arrows.
 */
export function BodySection({ body, today }: Pick<ProgressData, "body" | "today">) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const { range, points, unit, week } = body;
  const first = points[0];
  const last = points.at(-1);
  // Past about sixty readings, a point per week or month: their average.
  const line = thinRecords(points, range, { reduce: "mean" });

  // The body map steps a week at a time, independent of the graph's span.
  const stepWeek = (days: number) => {
    const next = new URLSearchParams(params.toString());
    const d = new Date(`${week.from}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    next.set("week", d.toISOString().slice(0, 10));
    startTransition(() => router.replace(`/progress?${next}` as Route, { scroll: false }));
  };

  return (
    <>
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

      {/* The muscles a week trained: a snapshot, not a trend, so it keeps its own week. */}
      <div className="mt-6 border-t border-hair pt-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="type-heading">Muscles this week</h2>
          <InfoTip label="About the body map">
            Working sets from finished workouts. A set counts once for each primary muscle and half
            for each secondary one; warm-ups are excluded.
          </InfoTip>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label="Previous week"
            disabled={pending}
            onClick={() => stepWeek(-7)}
            className="session-icon-button -ml-[10px] disabled:text-ink-2"
          >
            <Glyph name="chevronLeft" className="glyph-22" />
          </button>
          <p className="min-w-0 text-center type-meta font-semibold tabular-nums">
            {formatDateRange(week.from, week.to)}
          </p>
          <button
            type="button"
            aria-label="Next week"
            disabled={pending}
            onClick={() => stepWeek(7)}
            className="session-icon-button -mr-[10px] disabled:text-ink-2"
          >
            <Glyph name="chevronRight" className="glyph-22" />
          </button>
        </div>
        <div className={pending ? "opacity-50 transition-opacity" : undefined}>
          <BodyMap volume={week.volume} totalSets={week.totalSets} />
        </div>
      </div>
    </>
  );
}
