"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { PeriodSelect } from "@/components/ui/period-select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
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

export type ExerciseChoice = {
  options: readonly { id: string; name: string }[];
  selected: string | null;
  metric: BoardMetric | null;
  metrics: readonly { value: BoardMetric; label: string }[];
};

/**
 * The leaderboard's controls (plan §3.12), every choice in the URL so the server answers
 * with only the rows asked for and a refresh keeps the board: the mode, then what Activity
 * ranks by and over which period, or which movement Exercise ranks and by which of its
 * metrics. Native selects, since six labels do not fit one row of pills on a phone. The
 * board dims while the next one loads rather than blanking.
 */
export function LeaderboardControls({
  mode,
  activityMetric,
  period,
  exercise,
}: {
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

  return (
    <Card className={pending ? "opacity-60 transition-opacity" : undefined} aria-busy={pending}>
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
      {mode === "activity" ? (
        <>
          <Field label="Rank by">
            <Select
              value={activityMetric}
              onChange={(event) => navigate((params) => params.set("metric", event.target.value))}
            >
              {ACTIVITY_METRICS.map((metric) => (
                <option key={metric} value={metric}>
                  {ACTIVITY_METRIC_LABELS[metric]}
                </option>
              ))}
            </Select>
          </Field>
          <PeriodSelect value={period} />
        </>
      ) : (
        exercise.selected && (
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
            <Field label="Rank by">
              <Select
                value={exercise.metric ?? ""}
                onChange={(event) => navigate((params) => params.set("metric", event.target.value))}
              >
                {exercise.metrics.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )
      )}
    </Card>
  );
}
