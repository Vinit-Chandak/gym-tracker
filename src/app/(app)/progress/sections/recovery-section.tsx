"use client";

import Link from "@/components/ui/app-link";
import { Graph } from "@/components/graph/graph";
import { bucketLabel, counted, decimal, historyHref, workoutHref } from "@/components/graph/labels";
import { useUrlChoice } from "@/components/graph/use-url-choice";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { RECOVERY_MEASURES, type RecoveryMeasure } from "@/domain/progress-graphs";
import { SHORT_SLEEP_HOURS } from "@/domain/recovery";

import type { ProgressData } from "../progress-types";

/**
 * What the check-in asks: its segment, its name, its unit and what its scale means. `lowIsBetter`
 * answers are drawn downward, 1 at the top, so a better day is higher on every graph (DESIGN.md,
 * The Better Is Up Rule).
 */
export const RECOVERY_LABELS: Record<
  RecoveryMeasure,
  { short: string; long: string; unit: string; hint: string; lowIsBetter?: boolean }
> = {
  sleepHours: {
    short: "Sleep",
    long: "Sleep",
    unit: "h",
    // The rule in ink is the check-in's own threshold, said where the graph is explained.
    hint: `Hours slept the night before; under ${SHORT_SLEEP_HOURS} h the check-in says to hold loads.`,
  },
  sleepQuality: {
    short: "Quality",
    long: "Sleep quality",
    unit: "/ 5",
    hint: "1 is poor, 5 is great.",
  },
  fatigue: {
    short: "Fatigue",
    long: "Fatigue",
    unit: "/ 5",
    hint: "1 is fresh, 5 is wrecked; fresher is higher.",
    lowIsBetter: true,
  },
  soreness: {
    short: "Soreness",
    long: "Soreness",
    unit: "/ 5",
    hint: "1 is none, 5 is severe; less sore is higher.",
    lowIsBetter: true,
  },
};

/**
 * Hours a sleep scale may step by. Most divide the 6 h rule, so the rule stands on a line of the
 * scale and takes its label, rather than over an unlabelled line an hour off it (0, 5, 10); at 4
 * and 12 it stands clear between two labelled lines.
 */
const SLEEP_STEPS = [1, 2, 3, 4, 6, 12];

/**
 * Recovery (ADR 0042): hours slept as bars against the 6 h the check-in warns under, and the
 * three 1–5 answers as lines on their whole scale. A day checked in twice is one day: each
 * average is taken over days, and over the days that gave the answer.
 */
export function RecoverySection({ recovery, today }: Pick<ProgressData, "recovery" | "today">) {
  const { range, graph } = recovery;
  const recorded = RECOVERY_MEASURES.find((measure) => graph.summary[measure].days > 0);
  const [measure, setMeasure] = useUrlChoice<RecoveryMeasure>(
    "recovery",
    RECOVERY_MEASURES,
    recorded ?? "sleepHours",
  );
  const label = RECOVERY_LABELS[measure];
  const sleep = measure === "sleepHours";
  const summary = graph.summary[measure];
  const figure = (value: number) => decimal(value, 1);

  return (
    <div className="mt-3 space-y-3">
      <SegmentedControl
        name="recovery-measure"
        aria-label="Recovery measure"
        options={RECOVERY_MEASURES.map((value) => ({
          value,
          label: RECOVERY_LABELS[value].short,
          accessibleLabel: RECOVERY_LABELS[value].long,
        }))}
        value={measure}
        onChange={setMeasure}
        columns={4}
      />
      <Graph
        name={label.long}
        mark={sleep ? "bar" : "line"}
        placement="bucket"
        range={range}
        data={graph.buckets.map((bucket) => ({
          date: bucket.start,
          value: bucket.values[measure],
        }))}
        // Hours carry their unit on the scale as the 6 h rule does, so no line reads as a count.
        format={(value) => (sleep ? `${decimal(value, 1)} h` : decimal(value, 1))}
        scale={
          sleep
            ? { integral: true, steps: SLEEP_STEPS }
            : { min: 1, max: 5, ticks: [1, 3, 5], invert: label.lowIsBetter ?? false }
        }
        rule={sleep ? { value: SHORT_SLEEP_HOURS, label: `${SHORT_SLEEP_HOURS} h` } : undefined}
        summary={{
          label: sleep ? "Average a night" : "Average",
          figure: summary.mean === null ? null : figure(summary.mean),
          unit: label.unit,
          context:
            summary.mean === null
              ? null
              : `${counted(summary.days, sleep ? "night" : "day")} logged`,
        }}
        describe={(index) => {
          const bucket = graph.buckets[index]!;
          const value = bucket.values[measure];
          const name = bucketLabel(bucket, range.bucket, today);
          if (value === null)
            return {
              label: name,
              figure: null,
              context: bucket.readings > 0 ? `${label.long} not answered` : "No check-in",
            };
          const link = bucket.sessionId
            ? { href: workoutHref(bucket.sessionId, "history"), action: "Open workout" }
            : range.bucket === "day"
              ? bucket.readings > 1
                ? { href: historyHref(bucket.start, bucket.end), action: "Open day" }
                : {}
              : {
                  // Daily readings and workout check-ins can contribute to the same average.
                  href: historyHref(bucket.start, bucket.end),
                  action: range.bucket === "week" ? "Open week" : "Open month",
                };
          // Every graph gives its figures to a tenth, a night's sleep too: 7.25 h reads "7.3 h"
          // here (the owner's choice, ADR 0047); a history row says the night as a time.
          return {
            label: name,
            figure: figure(value),
            unit: label.unit,
            context:
              range.bucket === "day"
                ? bucket.readings > 1
                  ? `Average of ${counted(bucket.readings, "check-in")}`
                  : bucket.sessionId
                    ? "Workout check-in"
                    : "Daily check-in"
                : `Average of ${counted(bucket.days[measure], "day")}`,
            ...link,
          };
        }}
        note={{
          label: `About ${label.long.toLowerCase()}`,
          content: `${label.hint} Blank answers are left out of averages.`,
        }}
        // A span whose check-ins left this answer blank says so, not that there were none.
        empty={
          graph.checkIns > 0
            ? `${label.long} not answered in this range.`
            : "No check-ins in this range."
        }
        join
      />
      {graph.checkIns === 0 && (
        <Link
          href="/today"
          className="inline-flex min-h-[var(--ov-target)] items-center font-bold underline underline-offset-4"
        >
          Check in from Today
        </Link>
      )}
    </div>
  );
}
