"use client";

import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { Route } from "next";

import { DateRangeFields } from "@/components/date-range-fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chart, SERIES_COLORS, type ChartSeries } from "@/components/ui/chart";
import { FilterSheet } from "@/components/ui/filter-sheet";
import { InfoTip } from "@/components/ui/info-tip";
import { Field } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Tabs } from "@/components/ui/tabs";
import type { PerformanceSeries, Point } from "@/domain/analytics";
import type { MuscleVolume } from "@/domain/muscle-volume";
import type { MuscleGroup } from "@/domain/types";
import { formatDateRange, formatMinutes } from "@/lib/format";
import { LOAD_UNIT_LABELS, MUSCLE_LABELS } from "@/lib/labels";

/**
 * The body map carries an anatomical outline and every muscle region as path data, and only
 * one of five sections ever shows it. Loading it on demand keeps that weight out of the
 * bundle for the four sections that do not.
 */
const BodyMap = dynamic(() => import("@/components/ui/body-map").then((m) => m.BodyMap), {
  loading: () => (
    <p role="status" className="py-8 text-center text-sm text-ink-muted">
      Loading the body map…
    </p>
  ),
});

export type SeriesOption = {
  id: string;
  name: string;
  machine: string;
  unit: keyof typeof LOAD_UNIT_LABELS;
};

export type Week = {
  date: string;
  workouts: number;
  runs: number;
  runKm: number;
  runMinutes: number;
  muscles: Record<MuscleGroup, number>;
};

export type Adherence = {
  name: string;
  total: number;
  completed: number;
  skipped: number;
  remaining: number;
  completionRate: number | null;
};

type Props = {
  /** The range every trend on this screen is drawn over; the filter sheet changes it. */
  range: { from: string; to: string };
  summary: { workouts: number; runs: number; trainingDays: number; truncated: boolean };
  adherence: Adherence | null;
  weeks: Week[];
  recovery: {
    date: string;
    sleep: number | null;
    back: number | null;
    leftShin: number | null;
    rightShin: number | null;
  }[];
  pace: { date: string; value: number | null; mode: string }[];
  options: SeriesOption[];
  body: { from: string; to: string; volume: MuscleVolume; totalSets: number };
  /** Only the chosen exercise's numbers cross the wire; the rest stay on the server. */
  selected: PerformanceSeries | null;
};

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "strength", label: "Strength" },
  { value: "running", label: "Running" },
  { value: "recovery", label: "Recovery" },
  { value: "body", label: "Body" },
] as const;
type Tab = (typeof TABS)[number]["value"];

const STRENGTH_METRICS = [
  { value: "load", label: "Load" },
  { value: "reps", label: "Reps" },
  { value: "volume", label: "Volume" },
  { value: "rir", label: "RIR" },
  { value: "estimated1RM", label: "e1RM" },
] as const;
type StrengthMetric = (typeof STRENGTH_METRICS)[number]["value"];

const RUN_METRICS = [
  { value: "distance", label: "Distance" },
  { value: "duration", label: "Duration" },
  { value: "pace", label: "Pace" },
] as const;
type RunMetric = (typeof RUN_METRICS)[number]["value"];

const RECOVERY_METRICS = [
  { value: "sleep", label: "Sleep" },
  { value: "back", label: "Back" },
  { value: "leftShin", label: "L shin" },
  { value: "rightShin", label: "R shin" },
] as const;
type RecoveryMetric = (typeof RECOVERY_METRICS)[number]["value"];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 py-1 text-center">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-1 text-xl tabular-nums">{value}</dd>
    </div>
  );
}

/** Latest reading plus its change from the first, so a chart has a headline. */
function Headline({
  points,
  unit,
  lowerIsBetter,
}: {
  points: readonly Point[];
  unit: string;
  lowerIsBetter?: boolean;
}) {
  const known = points.filter((p): p is Point & { value: number } => p.value !== null);
  if (known.length === 0) return null;
  const first = known[0]!.value;
  const last = known[known.length - 1]!.value;
  const delta = Math.round((last - first) * 10) / 10;
  const better = lowerIsBetter ? delta < 0 : delta > 0;
  return (
    <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
      <span className="text-xl font-medium tabular-nums">
        {Math.round(last * 10) / 10}
        <span className="ml-1 text-sm font-normal text-ink-muted">{unit}</span>
      </span>
      {known.length > 1 && delta !== 0 && (
        <span className={better ? "text-sm text-success" : "text-sm text-ink-muted"}>
          {delta > 0 ? "+" : ""}
          {delta} since {known[0]!.date.slice(5).split("-").reverse().join("/")}
        </span>
      )}
    </p>
  );
}

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
        className="pointer-events-none absolute top-1/2 right-1.5 size-3.5 -translate-y-1/2 text-ink-subtle"
        aria-hidden
      />
    </span>
  );
}

export function ProgressView({
  range,
  summary,
  adherence,
  weeks,
  recovery,
  pace,
  options,
  selected,
  body,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [tab, setTab] = useState<Tab>("overview");
  const [metric, setMetric] = useState<StrengthMetric>("load");
  const [runMetric, setRunMetric] = useState<RunMetric>("distance");
  const [paceMode, setPaceMode] = useState("outdoor");
  const [recoveryMetric, setRecoveryMetric] = useState<RecoveryMetric>("sleep");

  // Every group is present now that volume is a full record, so offer only trained ones.
  const muscles = useMemo(
    () =>
      [...new Set(weeks.flatMap((w) => Object.entries(w.muscles).filter(([, n]) => n > 0)))]
        .map(([m]) => m)
        .filter((m, i, all) => all.indexOf(m) === i)
        .sort() as MuscleGroup[],
    [weeks],
  );
  const [muscle, setMuscle] = useState<MuscleGroup | "">("");
  const shownMuscle: MuscleGroup | undefined = muscle || muscles[0];

  // The picked exercise lives in the URL so the server sends one series, not all of them.
  const stepWeek = (days: number) => {
    const next = new URLSearchParams(params.toString());
    const d = new Date(`${body.from}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    next.set("week", d.toISOString().slice(0, 10));
    startTransition(() => router.replace(`/progress?${next}` as Route, { scroll: false }));
  };

  const chooseSeries = (id: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("series", id);
    startTransition(() => router.replace(`/progress?${next}` as Route, { scroll: false }));
  };

  /**
   * One exercise can have been done on several machines, and each is its own series
   * because the loads are not comparable. Two controls rather than one nested list: pick
   * the exercise, then the machine, but the value that travels is still the series id.
   */
  const byExercise = useMemo(() => {
    const map = new Map<string, SeriesOption[]>();
    for (const option of options) {
      const group = map.get(option.name) ?? [];
      group.push(option);
      map.set(option.name, group);
    }
    return map;
  }, [options]);
  const exerciseNames = [...byExercise.keys()];
  const machinesForExercise = selected ? (byExercise.get(selected.name) ?? []) : [];

  const weekDates = weeks.map((w) => w.date);
  const asPoints = (pick: (w: Week) => number): Point[] =>
    weeks.map((w) => ({ date: w.date, value: pick(w) }));

  const strengthUnit = selected
    ? metric === "reps"
      ? "reps"
      : metric === "rir"
        ? "RIR"
        : LOAD_UNIT_LABELS[selected.unit]
    : "";

  return (
    <div className="page-stack">
      <Tabs
        name="progress-tab"
        label="Progress section"
        options={TABS}
        value={tab}
        onChange={setTab}
        action={
          <FilterSheet title="Filters" summary={formatDateRange(range.from, range.to)}>
            {(close) => <DateRangeFields from={range.from} to={range.to} onApplied={close} />}
          </FilterSheet>
        }
      />

      {/* Only the chosen section is mounted; the controls above it keep their state. */}
      <div
        role="tabpanel"
        id="progress-tab-panel"
        aria-labelledby={`progress-tab-${tab}-tab`}
        tabIndex={0}
        className="page-stack min-w-0"
      >
        {tab === "overview" && (
          <>
            <dl className="grid box grid-cols-3 gap-2 px-2 py-3">
              <Stat label="Workouts" value={String(summary.workouts)} />
              <Stat label="Runs" value={String(summary.runs)} />
              <Stat label="Active days" value={String(summary.trainingDays)} />
            </dl>

            {summary.truncated && (
              <p role="status" className="text-sm text-warning">
                Over 500 workouts or runs in this range; narrow the dates for complete totals.
              </p>
            )}

            {adherence && (
              <Card>
                <div>
                  <h2 className="text-base font-medium">Programme adherence</h2>
                  <p className="mt-1 text-sm text-ink-muted">{adherence.name}</p>
                </div>
                <p className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
                  <span className="text-lg font-medium">
                    {adherence.completed}
                    <span className="font-normal text-ink-muted"> / {adherence.total}</span>
                  </span>
                  <span className="text-sm text-ink-muted">sessions</span>
                </p>
                <ProgressBar
                  value={adherence.completed}
                  max={adherence.total}
                  label={`${adherence.completed} of ${adherence.total} sessions complete`}
                />
                <p className="text-xs text-ink-muted">
                  {adherence.remaining} remaining · {adherence.skipped} skipped
                </p>
              </Card>
            )}

            <Card>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-medium">Weekly sessions</h2>
                <InfoTip label="About weekly sessions">
                  Weeks run Tuesday to Monday in your time zone. The first and last weeks of the
                  range may be partial.
                </InfoTip>
              </div>
              <Chart
                title="Sessions"
                unit="sessions"
                caption={false}
                series={[
                  {
                    name: "Lifting",
                    color: SERIES_COLORS.lifting,
                    points: asPoints((w) => w.workouts),
                  },
                  { name: "Runs", color: SERIES_COLORS.running, points: asPoints((w) => w.runs) },
                ]}
                format={(v) => String(Math.round(v))}
              />
            </Card>
          </>
        )}

        {tab === "strength" && (
          <>
            <Card>
              <Field label="Exercise">
                <Select
                  value={selected?.name ?? ""}
                  onChange={(e) => {
                    const first = byExercise.get(e.target.value)?.[0];
                    if (first) chooseSeries(first.id);
                  }}
                  disabled={options.length === 0 || pending}
                >
                  {options.length === 0 && <option value="">No logged exercises yet</option>}
                  {exerciseNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>
              </Field>

              {selected ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <SegmentedControl
                      name="strength-metric"
                      aria-label="Strength measurement"
                      options={STRENGTH_METRICS}
                      value={metric}
                      onChange={setMetric}
                      columns={5}
                    />
                  </div>
                  <div className={pending ? "opacity-50 transition-opacity" : undefined}>
                    <div className="flex items-start justify-between gap-2">
                      <Headline points={selected[metric]} unit={strengthUnit} />
                      <span className="flex max-w-[60%] min-w-0 items-center gap-1">
                        {/* The machine, in the corner, only when there is one to choose. */}
                        {machinesForExercise.length > 1 && (
                          <MachinePicker
                            entries={machinesForExercise}
                            value={selected.id}
                            disabled={pending}
                            onChange={chooseSeries}
                          />
                        )}
                        <InfoTip label="About this chart" className="shrink-0">
                          One point per session; warm-up sets are excluded.{" "}
                          {machinesForExercise.length > 1
                            ? "Each machine is its own series, because loads on different machines are not comparable."
                            : selected.machine === "Across gyms"
                              ? "The load means the same at every gym, so all sessions count."
                              : `Sessions on ${selected.machine}.`}
                        </InfoTip>
                      </span>
                    </div>
                    <Chart
                      title={STRENGTH_METRICS.find((m) => m.value === metric)!.label}
                      unit={metric === "volume" ? `${strengthUnit} × reps` : strengthUnit}
                      caption={false}
                      series={[
                        {
                          name: selected.name,
                          color: SERIES_COLORS.lifting,
                          points: selected[metric],
                        },
                      ]}
                    />
                  </div>
                </>
              ) : (
                <p className="text-sm text-ink-muted">
                  Finish a workout with logged sets to see trends.
                </p>
              )}
            </Card>

            {muscles.length > 0 && (
              <Card>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-medium">Sets by muscle</h2>
                  <InfoTip label="About sets by muscle">
                    Working sets per week. A set counts once for each primary muscle and half for
                    each secondary one; warm-ups are excluded.
                  </InfoTip>
                </div>
                <Field label="Muscle">
                  <Select
                    value={shownMuscle ?? ""}
                    onChange={(e) => setMuscle(e.target.value as MuscleGroup)}
                  >
                    {muscles.map((m) => (
                      <option key={m} value={m}>
                        {MUSCLE_LABELS[m]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Chart
                  title="Working sets"
                  unit="sets"
                  kind="bar"
                  caption={false}
                  series={[
                    {
                      name: "Sets",
                      color: SERIES_COLORS.lifting,
                      points: asPoints((w) => (shownMuscle ? (w.muscles[shownMuscle] ?? 0) : 0)),
                    },
                  ]}
                  format={(v) => String(Math.round(v))}
                />
              </Card>
            )}
          </>
        )}

        {tab === "running" && (
          <Card>
            <SegmentedControl
              name="run-metric"
              aria-label="Running measurement"
              options={RUN_METRICS}
              value={runMetric}
              onChange={setRunMetric}
              columns={3}
            />
            {runMetric === "pace" ? (
              <>
                <SegmentedControl
                  name="pace-mode"
                  aria-label="Pace context"
                  options={[
                    { value: "outdoor", label: "Outdoor" },
                    { value: "treadmill", label: "Treadmill" },
                  ]}
                  value={paceMode}
                  onChange={setPaceMode}
                  columns={2}
                />
                <Chart
                  title="Pace"
                  unit="min/km"
                  series={[
                    {
                      name: "Pace",
                      color: SERIES_COLORS.running,
                      points: pace.filter((p) => p.mode === paceMode),
                    },
                  ]}
                  format={(v) => {
                    const mins = Math.floor(v);
                    return `${mins}:${String(Math.round((v - mins) * 60)).padStart(2, "0")}`;
                  }}
                  note="Lower is faster. Outdoor and treadmill paces are kept apart."
                />
              </>
            ) : (
              <Chart
                title={runMetric === "distance" ? "Weekly distance" : "Weekly duration"}
                unit={runMetric === "distance" ? "km" : "min"}
                series={[
                  {
                    name: "Runs",
                    color: SERIES_COLORS.running,
                    points: asPoints((w) => (runMetric === "distance" ? w.runKm : w.runMinutes)),
                  } satisfies ChartSeries,
                ]}
                format={
                  runMetric === "duration"
                    ? (v) => (v >= 60 ? formatMinutes(v) : String(Math.round(v)))
                    : undefined
                }
              />
            )}
          </Card>
        )}

        {tab === "recovery" && (
          <Card>
            <SegmentedControl
              name="recovery-metric"
              aria-label="Recovery measurement"
              options={RECOVERY_METRICS}
              value={recoveryMetric}
              onChange={setRecoveryMetric}
              columns={4}
            />
            <Chart
              title={RECOVERY_METRICS.find((m) => m.value === recoveryMetric)!.label}
              unit={recoveryMetric === "sleep" ? "hours" : "0–10"}
              series={[
                {
                  name: "Reading",
                  color: SERIES_COLORS.lifting,
                  points: recovery.map((r) => ({ date: r.date, value: r[recoveryMetric] })),
                },
              ]}
              note="From workout check-ins, daily recovery entries and after-run shin scores. A missing reading leaves a gap."
            />
          </Card>
        )}

        {tab === "body" && (
          <Card>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-medium">Muscles this week</h2>
              <InfoTip label="About the body map">
                Working sets from finished workouts. A set counts once for each primary muscle and
                half for each secondary one; warm-ups are excluded.
              </InfoTip>
            </div>
            {/* Body keeps its own week navigation: it is a snapshot, not a trend. */}
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                aria-label="Previous week"
                disabled={pending}
                onClick={() => stepWeek(-7)}
              >
                <ChevronLeft className="size-5" aria-hidden />
              </Button>
              <p className="min-w-0 text-center text-sm font-medium">
                {formatDateRange(body.from, body.to)}
              </p>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Next week"
                disabled={pending}
                onClick={() => stepWeek(7)}
              >
                <ChevronRight className="size-5" aria-hidden />
              </Button>
            </div>
            <div className={pending ? "opacity-50 transition-opacity" : undefined}>
              <BodyMap volume={body.volume} totalSets={body.totalSets} />
            </div>
          </Card>
        )}

        {weekDates.length === 0 && (
          <p className="text-sm text-ink-muted">No weeks fall inside this range.</p>
        )}
      </div>
    </div>
  );
}
