"use client";

import { Graph } from "@/components/graph/graph";
import { bucketLabel, counted, decimal, foodDayHref } from "@/components/graph/labels";
import { useUrlChoice } from "@/components/graph/use-url-choice";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { reachesTarget } from "@/domain/progress-graphs";

import type { ProgressData } from "../progress-types";
import { FACT_SEPARATOR } from "@/lib/facts";

const METRICS = [
  { value: "kcal", label: "Calories" },
  { value: "protein", label: "Protein" },
] as const;
type FoodMetric = (typeof METRICS)[number]["value"];

/**
 * Food (ADR 0042): what each day came to, in kcal or in grams of protein, against today's
 * target, the bars that reach it set apart. Every average is taken over the days something was
 * logged: a day with nothing logged is a day nobody wrote down, not a day of eating nothing.
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
    <div className="progress-section">
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
        pigment="food"
        mark="bar"
        placement="bucket"
        range={range}
        data={graph.buckets.map((bucket) => {
          const value = kcal ? bucket.kcal : bucket.protein;
          return { date: bucket.start, value, reached: reachesTarget(value, target) };
        })}
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
                  kcal
                    ? `${summary.days.toLocaleString("en-GB")} of ${counted(graph.days, "day")} logged`
                    : `${summary.days.toLocaleString("en-GB")} of ${counted(graph.days, "day")} with protein recorded`,
                  target ? `target ${figure(target)}` : null,
                ]
                  .filter(Boolean)
                  .join(FACT_SEPARATOR),
        }}
        describe={(index) => {
          const bucket = graph.buckets[index]!;
          const value = kcal ? bucket.kcal : bucket.protein;
          const days = kcal ? bucket.kcalDays : bucket.proteinDays;
          const label = bucketLabel(bucket, range.bucket, today);
          const open = bucket.lastDay
            ? {
                href: foodDayHref(bucket.lastDay, today),
                action: range.bucket === "day" ? "Open day" : "Open food log",
              }
            : {};
          // Food logged by its energy alone (a quick add, a food saved without macros) is a day
          // with nothing to say about protein, not a day with nothing logged.
          if (value === null)
            return bucket.kcal === null
              ? { label, figure: null, context: "Nothing logged" }
              : { label, figure: null, context: "No protein recorded", ...open };
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
            ...open,
          };
        }}
        note={{
          label: "About these averages",
          content: `Averages count only days with food logged, never an empty day as zero.${
            target ? " The line is today's target; bars that reach it stand out." : ""
          }`,
        }}
        empty="No food logged in this range."
      />
    </div>
  );
}
