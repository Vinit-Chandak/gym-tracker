"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Card } from "@/components/ui/card";
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

export type ExerciseChoice = {
  options: readonly { id: string; name: string }[];
  selected: string | null;
  metric: BoardMetric | null;
  metrics: readonly { value: BoardMetric; label: string }[];
};

/**
 * The leaderboard's controls (plan §3.12, §3.16), every choice in the URL so the server
 * answers with only the rows asked for and a refresh keeps the board: Activity or Exercise,
 * then for Activity the sport, what it ranks by and over which period, or for Exercise which
 * movement it ranks and by which of its metrics. The rows keep their order whatever is chosen:
 * the default board opened on "Activity | Exercise" and a running one on "Lifting | Running",
 * as though they were two pages. Exercise ranks lifts, so it is offered wherever lifting is,
 * and choosing it is choosing lifting; the sport belongs to Activity and is asked under it.
 * Native selects, since six labels do not fit one row of pills on a phone. The board dims
 * while the next one loads rather than blanking.
 */
export function LeaderboardControls({
  sport,
  sports,
  mode,
  activityMetric,
  period,
  exercise,
}: {
  sport: TrainingSport;
  /** The viewer's sports, `sport` among them: one sport has no switch. */
  sports: readonly TrainingSport[];
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
      {sports.includes("workout") && (
        <SegmentedControl
          name="mode"
          aria-label="Leaderboard"
          columns={2}
          value={mode}
          // The metric belongs to the mode: the other board picks its own default. Exercise
          // ranks lifts, so choosing it from a running board turns to lifting.
          onChange={(next) =>
            navigate((params) => {
              params.set("mode", next);
              params.delete("metric");
              if (next === "exercise") params.set("sport", "workout");
            })
          }
          options={BOARD_MODES.map((value) => ({ value, label: BOARD_MODE_LABELS[value] }))}
        />
      )}
      {mode === "activity" ? (
        <>
          {/* The metric belongs to the sport: the other sport starts on its own board. */}
          <SportSwitch value={sport} sports={sports} resets={["mode", "metric"]} />
          <Field label="Rank by">
            <Select
              value={activityMetric}
              onChange={(event) => navigate((params) => params.set("metric", event.target.value))}
            >
              {ACTIVITY_METRICS[sport].map((metric) => (
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
