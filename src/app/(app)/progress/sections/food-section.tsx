"use client";

import { Graph } from "@/components/graph/graph";
import { bucketLabel, counted, decimal, foodDayHref } from "@/components/graph/labels";
import { useUrlChoice } from "@/components/graph/use-url-choice";
import { SegmentedControl } from "@/components/ui/segmented-control";

import type { ProgressData } from "../progress-types";

const METRICS = [
  { value: "kcal", label: "Calories" },
  { value: "protein", label: "Protein" },
] as const;
type FoodMetric = (typeof METRICS)[number]["value"];

/**
 * Food (ADR 0042): what each day came to, in kcal or in grams of protein, against today's
 * target. Every average is taken over the days something was logged: a day with nothing logged
 * is a day nobody wrote down, not a day of eating nothing.
 */
export function FoodSection({ food, today }: Pick<ProgressData, "food" | "today">) {
  const { range, graph, targets } = food;
  const [metric, setMetric] = useUrlChoice<FoodMetric>(
    "food",
    METRICS.map((m) => m.value),
    "kcal",
  );
  const kcal = metric === "kcal";
  const unit = kcal ? "kcal" : "g";
  const summary = kcal ? graph.kcal : graph.protein;
  const target = kcal ? targets.kcal : targets.protein;
  const figure = (value: number) => decimal(value, 0);

  return (
    <div className="mt-3 space-y-3">
      <SegmentedControl
        name="food-metric"
        aria-label="Food measure"
        options={METRICS}
        value={metric}
        onChange={setMetric}
        columns={2}
      />
      <Graph
        name={kcal ? "Calories" : "Protein"}
        mark="bar"
        placement="bucket"
        range={range}
        data={graph.buckets.map((bucket) => ({
          date: bucket.start,
          value: kcal ? bucket.kcal : bucket.protein,
        }))}
        format={figure}
        rule={target ? { value: target, label: figure(target) } : undefined}
        summary={{
          label: "Average a day",
          figure: summary.mean === null ? null : figure(summary.mean),
          unit,
          context:
            summary.mean === null
              ? null
              : [
                  `${summary.days.toLocaleString("en-GB")} of ${counted(graph.days, "day")} logged`,
                  target ? `target ${figure(target)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · "),
        }}
        describe={(index) => {
          const bucket = graph.buckets[index]!;
          const value = kcal ? bucket.kcal : bucket.protein;
          const days = kcal ? bucket.kcalDays : bucket.proteinDays;
          const label = bucketLabel(bucket, range.bucket, today);
          if (value === null) return { label, figure: null, context: "Nothing logged" };
          // A day says what else it came to; a week or a month what its average is over.
          const other = kcal ? bucket.protein : bucket.kcal;
          const context =
            range.bucket === "day"
              ? other === null
                ? null
                : kcal
                  ? `${figure(other)} g protein`
                  : `${figure(other)} kcal`
              : `Average of ${counted(days, "logged day")}`;
          return {
            label,
            figure: figure(value),
            unit,
            context,
            ...(bucket.lastDay
              ? {
                  href: foodDayHref(bucket.lastDay, today),
                  action: range.bucket === "day" ? "Open day" : "Open food log",
                }
              : {}),
          };
        }}
        note={{
          label: "About these averages",
          content: `An average is taken over the days with something logged; a day with nothing logged is left out rather than counted as zero.${
            target ? " The line is today's target." : ""
          }`,
        }}
        empty="No food logged in this range."
      />
    </div>
  );
}
