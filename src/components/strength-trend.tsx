"use client";

import type { ReactNode } from "react";

import { Chart, SERIES_COLORS } from "@/components/ui/chart";
import { Headline } from "@/components/ui/headline";
import { ChevronDown } from "@/components/ui/icons";
import { InfoTip } from "@/components/ui/info-tip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { PerformanceSeries } from "@/domain/analytics";
import { LOAD_UNIT_LABELS } from "@/lib/labels";

export type SeriesOption = {
  id: string;
  name: string;
  machine: string;
  unit: keyof typeof LOAD_UNIT_LABELS;
};

export const STRENGTH_METRICS = [
  { value: "load", label: "Load" },
  { value: "reps", label: "Reps" },
  { value: "volume", label: "Volume" },
  { value: "rir", label: "RIR" },
  { value: "estimated1RM", label: "e1RM" },
] as const;
export type StrengthMetric = (typeof STRENGTH_METRICS)[number]["value"];

/**
 * The machine, in the corner. One exercise done on two machines is two series, because
 * the loads are not comparable, and this is where the reader picks between them. It only
 * appears when there is a choice to make; a single series says nothing about itself.
 */
function MachinePicker({
  entries,
  value,
  disabled,
  onChange,
}: {
  entries: SeriesOption[];
  value: string;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  return (
    <span className="relative inline-flex max-w-full min-w-0">
      <select
        aria-label="Machine"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-8 w-full min-w-0 appearance-none truncate rounded-control bg-transparent py-1 pr-6 pl-2 text-xs font-medium text-ink-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50"
      >
        {entries.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.machine}
            {entry.unit === "kg" ? "" : ` · ${LOAD_UNIT_LABELS[entry.unit]}`}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-ink-subtle"
        aria-hidden
      />
    </span>
  );
}

/**
 * What one exercise has done over a range: the five measurements a set can be read by, the
 * latest number, and the line behind it.
 *
 * The contents of a card rather than the card itself, because the two screens that show it
 * introduce it differently — Progress lets you pick the exercise, an exercise's own page
 * already knows which one you are looking at — and everything below that choice is the
 * same on both. `metric` is the caller's state: Progress mounts this only while its
 * Strength section is open, and the measurement you were reading should survive leaving it.
 */
export function StrengthTrend({
  selected,
  machines,
  metric,
  onMetricChange,
  onChooseSeries,
  pending = false,
  picker,
  empty,
}: {
  /** Only the chosen series' numbers cross the wire; the rest stay on the server. */
  selected: PerformanceSeries | null;
  /** Every machine this exercise has been logged on, for the corner picker. */
  machines: SeriesOption[];
  metric: StrengthMetric;
  onMetricChange: (metric: StrengthMetric) => void;
  onChooseSeries: (id: string) => void;
  /** A series is being fetched: the chart dims rather than disappearing. */
  pending?: boolean;
  /** The exercise chooser, on a screen that has more than one exercise to show. */
  picker?: ReactNode;
  /** What to say when nothing has been logged to chart. */
  empty: ReactNode;
}) {
  const unit = selected
    ? metric === "reps"
      ? "reps"
      : metric === "rir"
        ? "RIR"
        : LOAD_UNIT_LABELS[selected.unit]
    : "";

  return (
    <>
      {picker}

      {selected ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <SegmentedControl
              name="strength-metric"
              aria-label="Strength measurement"
              options={STRENGTH_METRICS}
              value={metric}
              onChange={onMetricChange}
              columns={5}
            />
          </div>
          <div className={pending ? "opacity-50 transition-opacity" : undefined}>
            <div className="flex items-start justify-between gap-2">
              <Headline points={selected[metric]} unit={unit} />
              <span className="flex max-w-[60%] min-w-0 items-center gap-1">
                {/* The machine, in the corner, only when there is one to choose. */}
                {machines.length > 1 && (
                  <MachinePicker
                    entries={machines}
                    value={selected.id}
                    disabled={pending}
                    onChange={onChooseSeries}
                  />
                )}
                <InfoTip label="About this chart" className="shrink-0">
                  One point per session; warm-up sets are excluded.{" "}
                  {machines.length > 1
                    ? "Each machine is its own series, because loads on different machines are not comparable."
                    : selected.machine === "Across gyms"
                      ? "The load means the same at every gym, so all sessions count."
                      : `Sessions on ${selected.machine}.`}
                </InfoTip>
              </span>
            </div>
            <Chart
              title={STRENGTH_METRICS.find((m) => m.value === metric)!.label}
              unit={metric === "volume" ? `${unit} × reps` : unit}
              caption={false}
              series={[
                { name: selected.name, color: SERIES_COLORS.lifting, points: selected[metric] },
              ]}
            />
          </div>
        </>
      ) : (
        empty
      )}
    </>
  );
}
