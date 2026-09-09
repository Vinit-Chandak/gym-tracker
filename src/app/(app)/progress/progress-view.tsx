"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { Route } from "next";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BodyMap } from "@/components/ui/body-map";
import { Chart, SERIES_COLORS, type ChartSeries } from "@/components/ui/chart";
import { Field } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import type { PerformanceSeries, Point } from "@/domain/analytics";
import type { MuscleVolume } from "@/domain/muscle-volume";
import type { MuscleGroup } from "@/domain/types";
import { formatIsoDate, formatMinutes } from "@/lib/format";
import { LOAD_UNIT_LABELS, MUSCLE_LABELS } from "@/lib/labels";

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
    <Card className="gap-0.5 p-3 text-center">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-ink-muted">{label}</p>
    </Card>
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
    <p className="flex items-baseline gap-2">
      <span className="text-2xl font-semibold tabular-nums">
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

export function ProgressView({
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

  const grouped = useMemo(() => {
    const map = new Map<string, SeriesOption[]>();
    for (const option of options) {
      const group = map.get(option.name) ?? [];
      group.push(option);
      map.set(option.name, group);
    }
    return [...map.entries()];
  }, [options]);

  const weekDates = weeks.map((w) => w.date);
  const asPoints = (pick: (w: Week) => number): Point[] =>
    weeks.map((w) => ({ date: w.date, value: pick(w) }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Workouts" value={String(summary.workouts)} />
        <Stat label="Runs" value={String(summary.runs)} />
        <Stat label="Active days" value={String(summary.trainingDays)} />
      </div>

      {summary.truncated && (
        <p role="status" className="text-sm text-warning">
          This range exceeds 500 workouts or runs. Narrow the dates for complete totals.
        </p>
      )}

      <SegmentedControl
        name="progress-tab"
        aria-label="Progress section"
        options={TABS}
        value={tab}
        onChange={setTab}
        // Five across a phone crams "Recovery" into 50px of a 66px label; three wraps to
        // two rows and every tab stays readable.
        columns={3}
      />

      {tab === "overview" && (
        <>
          {adherence && (
            <Card>
              <h2 className="font-semibold">Programme adherence</h2>
              <p className="text-sm text-ink-muted">{adherence.name}</p>
              <p className="text-lg font-semibold tabular-nums">
                {adherence.completed} / {adherence.total} lifting sessions
              </p>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-surface-raised"
                role="img"
                aria-label={`${adherence.completed} of ${adherence.total} sessions complete`}
              >
                <div
                  className="h-full rounded-full bg-accent"
                  style={{
                    width: `${Math.round((adherence.completed / Math.max(1, adherence.total)) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-sm text-ink-muted">
                {adherence.skipped} skipped · {adherence.remaining} pending
                {adherence.completionRate !== null
                  ? ` · ${adherence.completionRate}% of resolved sessions completed`
                  : ""}
              </p>
            </Card>
          )}

          <Card>
            <Chart
              title="Weekly activity"
              unit="sessions"
              series={[
                {
                  name: "Lifting",
                  color: SERIES_COLORS.lifting,
                  points: asPoints((w) => w.workouts),
                },
                { name: "Runs", color: SERIES_COLORS.running, points: asPoints((w) => w.runs) },
              ]}
              format={(v) => String(Math.round(v))}
              note="Tuesday–Monday in your time zone. Range-edge weeks may be partial."
            />
          </Card>
        </>
      )}

      {tab === "strength" && (
        <>
          <Card>
            <Field label="Exercise">
              <Select
                value={selected?.id ?? ""}
                onChange={(e) => chooseSeries(e.target.value)}
                disabled={options.length === 0 || pending}
              >
                {options.length === 0 && <option value="">No logged exercises yet</option>}
                {/* Grouping by exercise keeps each option short enough to read. */}
                {grouped.map(([name, entries]) => (
                  <optgroup key={name} label={name}>
                    {entries.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.machine}
                        {entry.unit === "kg" ? "" : ` · ${LOAD_UNIT_LABELS[entry.unit]}`}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </Field>

            {selected ? (
              <>
                <SegmentedControl
                  name="strength-metric"
                  aria-label="Strength measurement"
                  options={STRENGTH_METRICS}
                  value={metric}
                  onChange={setMetric}
                  columns={3}
                />
                <div className={pending ? "opacity-50 transition-opacity" : undefined}>
                  <Headline
                    points={selected[metric]}
                    unit={
                      metric === "reps"
                        ? "reps"
                        : metric === "rir"
                          ? "RIR"
                          : LOAD_UNIT_LABELS[selected.unit]
                    }
                  />
                  <Chart
                    title={STRENGTH_METRICS.find((m) => m.value === metric)!.label}
                    unit={
                      metric === "reps"
                        ? "reps"
                        : metric === "rir"
                          ? "RIR"
                          : metric === "volume"
                            ? `${LOAD_UNIT_LABELS[selected.unit]} × reps`
                            : LOAD_UNIT_LABELS[selected.unit]
                    }
                    series={[
                      {
                        name: selected.name,
                        color: SERIES_COLORS.lifting,
                        points: selected[metric],
                      },
                    ]}
                    note={`${selected.machine}. Warm-ups excluded; each point is one session.`}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-ink-muted">
                Finish a workout with logged sets to see performance trends. Machines and units are
                kept separate.
              </p>
            )}
          </Card>

          {muscles.length > 0 && (
            <Card>
              <h2 className="font-semibold">Working sets by muscle</h2>
              <Field label="Primary muscle">
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
                series={[
                  {
                    name: "Sets",
                    color: SERIES_COLORS.lifting,
                    points: asPoints((w) => (shownMuscle ? (w.muscles[shownMuscle] ?? 0) : 0)),
                  },
                ]}
                format={(v) => String(Math.round(v))}
                note="Every non-warm-up set counts once for each primary muscle and half for each secondary one."
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
                note="Lower is faster."
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
            note="Workout check-ins, daily recovery and after-run shin scores. Missing readings stay blank."
          />
        </Card>
      )}

      {tab === "body" && (
        <Card>
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
              {formatIsoDate(body.from)} – {formatIsoDate(body.to)}
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
  );
}
