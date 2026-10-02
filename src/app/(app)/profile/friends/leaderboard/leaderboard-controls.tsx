"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Field } from "@/components/ui/field";
import { PeriodSelect } from "@/components/ui/period-select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { SportSwitch } from "@/components/ui/sport-switch";
import {
  ACTIVITY_METRIC_LABELS,
  ACTIVITY_METRICS,
  BOARD_MODE_LABELS,
  BOARD_MODES,
  type ActivityMetric,
  type BoardMetric,
  type BoardMode,
} from "@/domain/leaderboard";
import type { Period } from "@/domain/period";
import type { TrainingSport } from "@/domain/sport-scope";
import { cn } from "@/lib/utils";

export type ExerciseChoice = {
  options: readonly { id: string; name: string }[];
  selected: string | null;
  metric: BoardMetric | null;
  metrics: readonly { value: BoardMetric; label: string }[];
};

/** Metric cells wrap two or three to a row: never one stranded under a full row of others. */
function columnsFor(count: number): number {
  return count <= 4 ? 2 : 3;
}

/**
 * The leaderboard's controls (plan §3.12, §3.16), every choice in the URL so the server
 * answers with only the rows asked for and a refresh keeps the board: the sport, then for
 * lifting the mode, then what Activity ranks by and over which period, or which movement
 * Exercise ranks and by which of its metrics. Each choice is a segmented track with the
 * chosen cell under the highlighter; only the movement stays a native select, because the
 * list of movements a circle has logged has no upper bound. Running is one board, so its
 * mode control is not drawn. The board dims while the next one loads rather than blanking.
 */
export function LeaderboardControls({
  sport,
  mode,
  activityMetric,
  period,
  exercise,
}: {
  sport: TrainingSport;
  mode: BoardMode;
  activityMetric: ActivityMetric;
  period: Period;
  exercise: ExerciseChoice;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const navigate = (change: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    change(params);
    startTransition(() =>
      router.replace(`${pathname}?${params.toString()}` as Route, { scroll: false }),
    );
  };
  const activityOptions = ACTIVITY_METRICS[sport].map((metric) => ({
    value: metric,
    label: ACTIVITY_METRIC_LABELS[metric],
  }));

  return (
    <div className={cn("space-y-3", pending && "opacity-60 transition-opacity")} aria-busy={pending}>
      {/* The mode and metric belong to the sport: the other sport starts on its own board. */}
      <SportSwitch value={sport} resets={["mode", "metric"]} />
      {sport === "workout" && (
        <SegmentedControl
          name="mode"
          aria-label="Leaderboard"
          columns={2}
          value={mode}
          // The metric belongs to the mode: the other board picks its own default.
          onChange={(next) =>
            navigate((params) => {
              params.set("mode", next);
              params.delete("metric");
            })
          }
          options={BOARD_MODES.map((value) => ({ value, label: BOARD_MODE_LABELS[value] }))}
        />
      )}
      {mode === "activity" ? (
        <>
          <Field group label="Rank by">
            <SegmentedControl
              name="metric"
              columns={columnsFor(activityOptions.length)}
              value={activityMetric}
              onChange={(next) => navigate((params) => params.set("metric", next))}
              options={activityOptions}
            />
          </Field>
          <PeriodSelect value={period} />
        </>
      ) : (
        exercise.selected &&
        exercise.metric && (
          <>
            <Field label="Exercise">
              <Select
                value={exercise.selected}
                // A different movement is ranked by different metrics; start on its primary.
                onChange={(event) =>
                  navigate((params) => {
                    params.set("exercise", event.target.value);
                    params.delete("metric");
                  })
                }
              >
                {exercise.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field group label="Rank by">
              <SegmentedControl
                name="metric"
                columns={columnsFor(exercise.metrics.length)}
                value={exercise.metric}
                onChange={(next) => navigate((params) => params.set("metric", next))}
                options={exercise.metrics}
              />
            </Field>
          </>
        )
      )}
    </div>
  );
}
