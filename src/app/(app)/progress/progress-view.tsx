"use client";

import {
  Bicycle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  Run,
  Waves,
  type AppIcon,
} from "@/components/ui/icons";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import type { Route } from "next";

import Link from "@/components/ui/app-link";
import { BodyMap } from "@/components/ui/body-map";
import { DateRangeFields } from "@/components/date-range-fields";
import { StrengthTrend, type SeriesOption, type StrengthMetric } from "@/components/strength-trend";
import { PeriodisationChart, type PeriodisationData } from "@/components/periodisation-chart";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chart, SERIES_COLORS, type ChartSeries } from "@/components/ui/chart";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterSheet } from "@/components/ui/filter-sheet";
import { Headline } from "@/components/ui/headline";
import { InfoTip } from "@/components/ui/info-tip";
import { Field } from "@/components/ui/input";
import { PRESSABLE_ROW_CLASS } from "@/components/ui/link-row";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { StatTile, StatTileRow } from "@/components/ui/stat-tile";
import type { PerformanceSeries, Point } from "@/domain/analytics";
import type { MuscleVolume } from "@/domain/muscle-volume";
import type { BodyLoadUnit, MuscleGroup } from "@/domain/types";
import { addDays as addIsoDays } from "@/domain/program-calendar";
import type { RecoveryReading } from "@/domain/recovery";
import { formatDateRange, formatIsoDay, formatMinutes, formatTotalKm } from "@/lib/format";
import { MUSCLE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { pageSection, PROGRESS_SECTIONS, ProgressSections } from "./progress-sections";
import { RecoveryProgress } from "./recovery-progress";

export type Week = {
  date: string;
  workouts: number;
  runs: number;
  runKm: number;
  runMinutes: number;
  muscles: Record<MuscleGroup, number>;
  /** The week is still running, so its totals are not a whole week's. */
  partial: boolean;
};

/** One run as the Running section lists it, already formatted in the account's time zone. */
export type RunRow = {
  id: string;
  href: `/training/activities/${string}`;
  when: string;
  environment: string;
  distanceKm: string;
  pace: string;
  duration: string;
  /** The same run in numbers, for the totals over the range. */
  distanceMeters: number;
  durationSeconds: number;
};

export type SportTotal = {
  sport: string;
  label: string;
  count: number;
  days: number;
  durationMs: number;
  unknownDurations: number;
  distanceMetres: number | null;
  unknownDistances: number;
};

type Props = {
  /** The range every trend on this screen is drawn over; the filter sheet changes it. */
  range: { from: string; to: string };
  /** The narrative lists hit their cap, so the charts are drawn from a sample. */
  truncated: boolean;
  /**
   * Per-sport totals over the whole range, computed in SQL (plan §9.1).
   *
   * Absent before canonical writes are the authority, because there is nothing canonical to
   * total yet. When present these are complete, which is why they are shown beside the list
   * caps rather than instead of them: a list is a sample and a total is a total.
   */
  sportTotals: readonly SportTotal[] | null;
  weeks: Week[];
  recovery: RecoveryReading[];
  pace: { date: string; value: number | null; mode: string }[];
  /** Every run in `range`, newest first. */
  runs: RunRow[];
  options: SeriesOption[];
  body: { from: string; to: string; volume: MuscleVolume; totalSets: number };
  /** Body weight readings over `range`, already converted into `unit`. */
  bodyWeight: Point[];
  /** The account's own unit, which body weight is read in. */
  unit: BodyLoadUnit;
  /** Only the chosen exercise's numbers cross the wire; the rest stay on the server. */
  selected: PerformanceSeries | null;
  /** The active programme as the periodisation chart reads it, or null without one. */
  programme: PeriodisationData | null;
};

const RUN_METRICS = [
  { value: "distance", label: "Distance" },
  { value: "duration", label: "Duration" },
  { value: "pace", label: "Pace" },
] as const;
type RunMetric = (typeof RUN_METRICS)[number]["value"];

/** The glyph each sport is listed under, the same ones the tab bar and the cycle strip use. */
const SPORT_ICONS: Record<string, AppIcon> = {
  strength: Dumbbell,
  running: Run,
  cycling: Bicycle,
  swimming: Waves,
};

const integer = (value: number) => String(Math.round(value));
/** "5:30" for a pace held as decimal minutes per kilometre. */
const paceLabel = (value: number) => {
  const mins = Math.floor(value);
  return `${mins}:${String(Math.round((value - mins) * 60)).padStart(2, "0")}`;
};

/**
 * A column heading on the sheet, as `Section` draws one, with the tip named by the caller
 * where the section's own name would not say what the tip is about, and a figure in the data
 * voice at the far end of the same line: what the block beneath covers or adds up to.
 */
function Label({
  title,
  tip,
  tipLabel,
  meta,
  children,
}: {
  title: string;
  tip?: ReactNode;
  tipLabel?: string;
  meta?: string | null;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pb-2">
        <h2 className="flex items-center gap-1 text-xs font-semibold tracking-[0.08em] text-ink-muted uppercase">
          {title}
          {tip && <InfoTip label={tipLabel ?? `About ${title.toLowerCase()}`}>{tip}</InfoTip>}
        </h2>
        {meta && (
          <p className="ml-auto font-data text-sm font-medium text-ink-muted tabular-nums">
            {meta}
          </p>
        )}
      </div>
      <div className="min-w-0 space-y-3">{children}</div>
    </section>
  );
}

/** Where the programme stands, in two lines under its chart: this week's work, and the sequence. */
function ProgrammeStanding({ programme }: { programme: PeriodisationData }) {
  const thisWeek = programme.weeks.find(
    (week) => programme.today >= week.date && programme.today < addIsoDays(week.date, 7),
  );
  const planned = Math.round((programme.setsPerCycle * 7) / Math.max(programme.daysPerCycle, 1));
  return (
    <ul className="space-y-1 border-t border-line pt-3 font-data text-sm text-ink-muted tabular-nums">
      <li>
        <span className="font-semibold text-ink">{thisWeek?.sets ?? 0}</span> working sets this week
        · the plan asks {planned}
      </li>
      <li>
        <span className="font-semibold text-ink">{programme.progress.completed}</span> of{" "}
        {programme.progress.total} programme days done
      </li>
    </ul>
  );
}

export function ProgressView({
  range,
  truncated,
  sportTotals,
  weeks,
  recovery,
  pace,
  runs,
  options,
  selected,
  body,
  bodyWeight,
  unit,
  programme,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  // The programme opens the tab while one is being trained; without one, Body does.
  const tab = pageSection(params.get("view"), programme ? "programme" : "body");
  const chooseView = (key: "view" | "recovery", value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    // Local view state belongs in the URL so filters, reload and Back preserve it.
    window.history.replaceState(null, "", `/progress?${next}`);
  };
  const [metric, setMetric] = useState<StrengthMetric>("load");
  const [runMetric, setRunMetric] = useState<RunMetric>("distance");
  const [paceMode, setPaceMode] = useState("outdoor");

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

  const asPoints = (pick: (w: Week) => number): Point[] =>
    weeks.map((w) => ({ date: w.date, value: pick(w), partial: w.partial }));
  /**
   * The headline over a weekly chart is the latest whole week: a week still running would
   * read as a drop, and the chart already draws it hatched. A range of one unfinished week
   * is headlined by that week, which is all there is.
   */
  const wholeWeeks = weeks.some((w) => !w.partial) ? weeks.filter((w) => !w.partial) : weeks;
  const asWholePoints = (pick: (w: Week) => number): Point[] =>
    wholeWeeks.map((w) => ({ date: w.date, value: pick(w) }));
  /**
   * What the weekly charts actually cover. They stop at the last week with training in it
   * rather than at today, so the axis and the dates in the filter can differ by the weeks
   * you have not trained in — worth one line above the chart rather than a mystery.
   */
  const lastWeek = weeks[weeks.length - 1];
  const weeksNote = !lastWeek
    ? null
    : `${weeks.length} ${weeks.length === 1 ? "week" : "weeks"}${
        // Naming the Monday of a week that has not finished would read as its end date.
        lastWeek.partial
          ? " · this week so far"
          : ` to ${formatIsoDay(addIsoDays(lastWeek.date, 6))}`
      }`;

  // The range's running in numbers, under the chart: every run, not the sampled weeks.
  const runTotals =
    runs.length === 0
      ? null
      : {
          distance: runs.reduce((sum, run) => sum + run.distanceMeters, 0),
          seconds: runs.reduce((sum, run) => sum + run.durationSeconds, 0),
          longest: Math.max(...runs.map((run) => run.distanceMeters)),
        };
  const pacePoints = pace.filter((p) => p.mode === paceMode);

  return (
    <div className="page-stack">
      <ProgressSections
        value={tab}
        onChange={(section) => chooseView("view", section)}
        action={
          <FilterSheet title="Filters" summary={formatDateRange(range.from, range.to)}>
            {(close) => <DateRangeFields from={range.from} to={range.to} onApplied={close} />}
          </FilterSheet>
        }
      />

      {/* Only the chosen section is mounted; the controls above it keep their state. */}
      <section
        aria-label={PROGRESS_SECTIONS.find((option) => option.value === tab)!.label}
        className="page-stack min-w-0"
      >
        {tab === "programme" &&
          (programme ? (
            <Label
              title="The programme"
              tipLabel="About the periodisation chart"
              tip="Working sets from finished workouts, week by week, over the programme's cycles. The dashed step is what a week of the programme asks. The highlighted cycle is the one the sequence is on, whatever the calendar says, and the pen line is today."
              meta={`Cycle ${programme.currentCycle} of ${programme.cycles}`}
            >
              <Card>
                <p className="[overflow-wrap:anywhere]">
                  <span className="font-medium">{programme.name}</span>
                  <span className="font-data text-ink-muted tabular-nums">
                    {" "}
                    · {formatDateRange(programme.startDate, programme.endDate)}
                  </span>
                </p>
                <PeriodisationChart data={programme} />
                <ProgrammeStanding programme={programme} />
              </Card>
              <Link
                href="/profile/programme"
                className="inline-block text-sm font-medium text-pen focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
              >
                Open the programme
              </Link>
            </Label>
          ) : (
            <Card>
              <EmptyState
                icon={ClipboardList}
                title="No programme yet"
                description="Start one and this sheet shows the work of every week over the programme's cycles."
                action={
                  <LinkButton href="/profile/programme" variant="secondary">
                    Choose a programme
                  </LinkButton>
                }
              />
            </Card>
          ))}

        {tab === "overview" && (
          <>
            {truncated && (
              <p role="status" className="text-sm text-warning">
                Over 500 workouts or runs in this range; the charts below draw a sample. The
                training totals are complete.
              </p>
            )}

            {/* The plot that owns the screen: lifting in ink, running in the pen, week by week. */}
            <Label
              title="Weekly sessions"
              tip={
                <>
                  Weeks run Monday to Sunday in your time zone. The chart ends at the last week you
                  trained in, not at today, so it never finishes on an empty column. A week still
                  running is drawn hatched: its total is not a whole week&rsquo;s yet.
                </>
              }
              meta={weeksNote}
            >
              <Card>
                <Chart
                  title="Sessions"
                  unit="sessions"
                  kind="bar"
                  caption={false}
                  series={[
                    {
                      name: "Lifting",
                      color: SERIES_COLORS.lifting,
                      points: asPoints((w) => w.workouts),
                    },
                    {
                      name: "Runs",
                      color: SERIES_COLORS.running,
                      points: asPoints((w) => w.runs),
                    },
                  ]}
                  format={integer}
                />
              </Card>
            </Label>

            {/* The totals are complete where the chart is a sample: every sport's sessions,
                days, time and distance, one ruled row each. */}
            {sportTotals && sportTotals.some((total) => total.count > 0) && (
              <Label
                title="Training totals"
                tipLabel="What these totals count"
                tip="Every activity in this range, counted in full rather than sampled. Recorded training time, not unique wall-clock time — overlapping sessions are counted once each. Distance is per sport and never added across them."
              >
                <ul className="box-rows">
                  {sportTotals
                    .filter((total) => total.count > 0)
                    .map((total) => {
                      const Icon = SPORT_ICONS[total.sport] ?? Dumbbell;
                      const unknown = [
                        total.unknownDistances > 0
                          ? `${total.unknownDistances} without a distance`
                          : null,
                        total.unknownDurations > 0
                          ? `${total.unknownDurations} without a duration`
                          : null,
                      ].filter(Boolean);
                      return (
                        <li key={total.sport} className="flex min-h-14 items-center gap-3 py-3">
                          <Icon scale="row" className="shrink-0 text-ink-muted" aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{total.label}</p>
                            <p className="mt-0.5 font-data text-sm [overflow-wrap:anywhere] text-ink-muted tabular-nums">
                              {total.count} {total.count === 1 ? "session" : "sessions"} ·{" "}
                              {total.days} {total.days === 1 ? "day" : "days"} ·{" "}
                              {formatMinutes(total.durationMs / 60_000)}
                              {total.distanceMetres !== null && total.distanceMetres > 0
                                ? ` · ${Math.round(total.distanceMetres / 100) / 10} km`
                                : ""}
                            </p>
                            {/* What the totals could not include, said rather than hidden. */}
                            {unknown.length > 0 && (
                              <p className="mt-0.5 text-xs text-ink-subtle">
                                {unknown.join(" · ")}
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                </ul>
              </Label>
            )}
          </>
        )}

        {tab === "strength" && (
          <>
            <Card>
              <StrengthTrend
                selected={selected}
                machines={machinesForExercise}
                metric={metric}
                onMetricChange={setMetric}
                onChooseSeries={chooseSeries}
                pending={pending}
                picker={
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
                }
                empty={
                  <p className="text-sm text-ink-muted">
                    Finish a workout with logged sets to see trends.
                  </p>
                }
              />
            </Card>

            {muscles.length > 0 && (
              <Label
                title="Sets by muscle"
                tip="Working sets per week. A set counts once for each primary muscle and half for each secondary one; warm-ups are excluded."
                meta={weeksNote}
              >
                <Card>
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
                  <Headline
                    points={asWholePoints((w) => (shownMuscle ? (w.muscles[shownMuscle] ?? 0) : 0))}
                    unit="sets"
                    format={integer}
                  />
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
                    format={integer}
                  />
                </Card>
              </Label>
            )}
          </>
        )}

        {tab === "running" && (
          <>
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
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <Headline points={pacePoints} unit="min/km" format={paceLabel} lowerIsBetter />
                    <InfoTip label="About pace" className="ml-auto">
                      Lower is faster. Outdoor and treadmill paces are kept apart.
                    </InfoTip>
                  </div>
                  <Chart
                    title="Pace"
                    unit="min/km"
                    caption={false}
                    series={[{ name: "Pace", color: SERIES_COLORS.running, points: pacePoints }]}
                    format={paceLabel}
                  />
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
                    {runMetric === "distance" ? (
                      <Headline points={asWholePoints((w) => w.runKm)} unit="km" />
                    ) : (
                      <Headline
                        points={asWholePoints((w) => w.runMinutes)}
                        unit=""
                        format={formatMinutes}
                      />
                    )}
                    {weeksNote && (
                      <p className="ml-auto font-data text-sm font-medium text-ink-muted tabular-nums">
                        {weeksNote}
                      </p>
                    )}
                  </div>
                  <Chart
                    title={runMetric === "distance" ? "Weekly distance" : "Weekly duration"}
                    unit={runMetric === "distance" ? "km" : "min"}
                    kind="bar"
                    caption={false}
                    series={[
                      {
                        name: "Runs",
                        color: SERIES_COLORS.running,
                        points: asPoints((w) =>
                          runMetric === "distance" ? w.runKm : w.runMinutes,
                        ),
                      } satisfies ChartSeries,
                    ]}
                    format={
                      runMetric === "duration"
                        ? (v) => (v >= 60 ? formatMinutes(v) : String(Math.round(v)))
                        : undefined
                    }
                  />
                </>
              )}
            </Card>

            {/* The range in numbers, from every run rather than the sampled weeks. */}
            {runTotals && (
              <Card>
                <StatTileRow>
                  <StatTile label="Runs" value={runs.length} />
                  <StatTile label="Distance" value={formatTotalKm(runTotals.distance)} />
                  <StatTile label="Time" value={formatMinutes(runTotals.seconds / 60)} />
                  <StatTile label="Longest run" value={formatTotalKm(runTotals.longest)} />
                </StatTileRow>
              </Card>
            )}

            <Label
              title="Runs"
              tipLabel="About the run list"
              tip="Every run in the chosen dates, newest first. Pace is the average over the whole run, in minutes per kilometre. Change the dates with Filters."
            >
              {runs.length === 0 ? (
                <p className="box py-4 text-sm text-ink-muted">No runs in this range.</p>
              ) : (
                <ul className="box-rows">
                  {runs.map((run) => (
                    <li key={run.id}>
                      <Link
                        href={run.href}
                        prefetch="intent"
                        className={cn(PRESSABLE_ROW_CLASS, "flex-wrap")}
                      >
                        <Run scale="row" className="shrink-0 text-ink-muted" aria-hidden />
                        <span className="min-w-0 flex-[1_1_8rem]">
                          <span className="block font-data text-base font-semibold tabular-nums">
                            {run.distanceKm} km
                          </span>
                          <span className="mt-0.5 block text-sm [overflow-wrap:anywhere] text-ink-muted tabular-nums">
                            {run.when} · {run.environment} · {run.duration}
                          </span>
                        </span>
                        <span className="ml-auto flex items-center gap-2">
                          <span className="font-data text-sm text-ink-muted tabular-nums">
                            {run.pace} /km
                          </span>
                          <ChevronRight className="shrink-0 text-ink-subtle" aria-hidden />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Label>
          </>
        )}

        {tab === "recovery" && (
          <RecoveryProgress
            readings={recovery}
            selected={params.get("recovery")}
            onSelect={(metric) => chooseView("recovery", metric)}
          />
        )}

        {tab === "body" && (
          <>
            <Label
              title="Muscles this week"
              tipLabel="About the body map"
              tip="Working sets from finished workouts. A set counts once for each primary muscle and half for each secondary one; warm-ups are excluded."
            >
              <Card>
                {/* Body keeps its own week navigation: it is a snapshot, not a trend. */}
                <div className="flex items-center justify-between gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Previous week"
                    disabled={pending}
                    onClick={() => stepWeek(-7)}
                  >
                    <ChevronLeft aria-hidden />
                  </Button>
                  <p className="min-w-0 text-center font-data text-base font-semibold tabular-nums">
                    {formatDateRange(body.from, body.to)}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Next week"
                    disabled={pending}
                    onClick={() => stepWeek(7)}
                  >
                    <ChevronRight aria-hidden />
                  </Button>
                </div>
                {/* The last week's map holds, dimmed, while the next one loads. */}
                <div
                  className={cn("transition-opacity", pending && "opacity-50")}
                  aria-busy={pending}
                >
                  <BodyMap volume={body.volume} totalSets={body.totalSets} />
                </div>
              </Card>
            </Label>

            <Label
              title="Body weight"
              tip="Every reading you have entered, from finishing a workout or from your profile. One reading per day; the newest is the weight shown on your profile."
            >
              <Card>
                {bodyWeight.length > 0 ? (
                  <>
                    <Headline points={bodyWeight} unit={unit} />
                    <Chart
                      title="Body weight"
                      unit={unit}
                      caption={false}
                      series={[
                        { name: "Body weight", color: SERIES_COLORS.lifting, points: bodyWeight },
                      ]}
                    />
                  </>
                ) : (
                  <p className="text-sm text-ink-muted">
                    No readings in this range. Weight recorded when you finish a session appears
                    here, and you can set it any day from Profile → Edit profile.
                  </p>
                )}
              </Card>
            </Label>
          </>
        )}
      </section>
    </div>
  );
}
