"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import type { Route } from "next";

import { Art } from "@/components/art/art";
import { DateRangeFields } from "@/components/date-range-fields";
import {
  monthDays,
  tally,
  tallyDistance,
  tallyName,
  ART_SPORT,
  type DayActivity,
} from "@/components/progress/calendar";
import { StrengthTrend, type SeriesOption, type StrengthMetric } from "@/components/strength-trend";
import Link from "@/components/ui/app-link";
import { BodyMap } from "@/components/ui/body-map";
import { FilterSheet } from "@/components/ui/filter-sheet";
import { Glyph } from "@/components/ui/glyphs";
import { Headline } from "@/components/ui/headline";
import { InfoTip } from "@/components/ui/info-tip";
import { ChartValues, InkBars, InkLine, type InkPoint } from "@/components/ui/ink-chart";
import { Field } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import type { PerformanceSeries, Point } from "@/domain/analytics";
import type { MuscleVolume } from "@/domain/muscle-volume";
import { addDays as addIsoDays } from "@/domain/program-calendar";
import type { RecoveryReading } from "@/domain/recovery";
import type { BodyLoadUnit, MuscleGroup } from "@/domain/types";
import {
  formatDateRange,
  formatIsoDay,
  formatIsoMonth,
  formatIsoShortDay,
  formatMinutes,
} from "@/lib/format";
import { MUSCLE_LABELS } from "@/lib/labels";

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
  /** A range or week the reader asked for that could not be read. */
  error: string | null;
  /** This month so far, for Overview's calendar: every activity of every day. */
  month: { month: string; today: number; activities: readonly DayActivity[] };
  /** The range every trend on this screen is drawn over; the filter sheet changes it. */
  range: { from: string; to: string };
  /** The narrative lists hit their cap, so the charts are drawn from a sample. */
  truncated: boolean;
  /**
   * Per-sport totals over the whole range, computed in SQL (plan §9.1). Complete, which is why
   * they are shown beside the list caps rather than instead of them: a list is a sample and a
   * total is a total.
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
};

const RUN_METRICS = [
  { value: "distance", label: "Distance" },
  { value: "duration", label: "Duration" },
  { value: "pace", label: "Pace" },
] as const;
type RunMetric = (typeof RUN_METRICS)[number]["value"];

/** "6:06": a pace in minutes per kilometre, as a run is read. */
const paceLabel = (value: number) => {
  const minutes = Math.floor(value);
  const seconds = Math.round((value - minutes) * 60);
  return seconds === 60 ? `${minutes + 1}:00` : `${minutes}:${String(seconds).padStart(2, "0")}`;
};

/** A section's heading over its chart: what it counts, and what it covers, on one line. */
function ChartHead({ title, note }: { title: string; note?: string | null }) {
  return (
    <h3 className="chart-head">
      <span>{title}</span>
      {note && <span className="font-medium tabular-nums">{note}</span>}
    </h3>
  );
}

export function ProgressView({
  error,
  month,
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
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const tab = pageSection(params.get("view"));
  const chooseView = (key: "view" | "recovery", value: string) => {
    const next = new URLSearchParams(params.toString());
    if (key === "view" && value === "overview") next.delete("view");
    else next.set(key, value);
    // Local view state belongs in the URL so filters, reload and Back preserve it.
    const query = next.toString();
    window.history.replaceState(null, "", query ? `/progress?${query}` : "/progress");
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

  // The body map steps a week at a time, independent of the trend range.
  const stepWeek = (days: number) => {
    const next = new URLSearchParams(params.toString());
    const d = new Date(`${body.from}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    next.set("week", d.toISOString().slice(0, 10));
    startTransition(() => router.replace(`/progress?${next}` as Route, { scroll: false }));
  };

  // The picked exercise lives in the URL so the server sends one series, not all of them.
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

  const asPoints = (pick: (w: Week) => number): InkPoint[] =>
    weeks.map((w) => ({ date: w.date, value: pick(w), partial: w.partial }));
  /**
   * What the weekly charts actually cover. They stop at the last week with training in it
   * rather than at today, so the axis and the dates in the filter can differ by the weeks
   * you have not trained in: worth one line above the chart rather than a mystery.
   */
  const lastWeek = weeks[weeks.length - 1];
  const weeksNote = !lastWeek
    ? null
    : `${weeks.length} ${weeks.length === 1 ? "week" : "weeks"}${
        // Naming the Monday of a week that has not finished would read as its end date.
        lastWeek.partial
          ? " · this week so far"
          : ` to ${formatIsoShortDay(addIsoDays(lastWeek.date, 6))}`
      }`;
  const weekEnds: [string, string] | undefined = lastWeek
    ? [formatIsoShortDay(weeks[0]!.date), formatIsoShortDay(lastWeek.date)]
    : undefined;
  const rangeText = formatDateRange(range.from, range.to);

  return (
    <div className="progress-view">
      <ProgressSections
        value={tab}
        onChange={(section) => chooseView("view", section)}
        range={tab === "overview" ? null : rangeText}
        filters={
          <FilterSheet title="Filters" summary={rangeText}>
            {(close) => <DateRangeFields from={range.from} to={range.to} onApplied={close} />}
          </FilterSheet>
        }
      />
      {error && (
        <p role="alert" className="mt-3 flex items-start gap-2 type-meta font-semibold">
          <Glyph name="warn" className="mt-px glyph-18" />
          {error}
        </p>
      )}

      {/* Only the chosen section is mounted; the controls above it keep their state. */}
      <section
        aria-label={PROGRESS_SECTIONS.find((option) => option.value === tab)!.label}
        className="min-w-0"
      >
        {tab === "overview" && (
          <Overview
            month={month}
            range={rangeText}
            truncated={truncated}
            sportTotals={sportTotals}
            lifting={asPoints((w) => w.workouts)}
            running={asPoints((w) => w.runs)}
            weeksNote={weeksNote}
            weekEnds={weekEnds}
          />
        )}

        {tab === "strength" && (
          <div className="mt-3">
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
                <p className="type-meta text-ink-2">
                  Finish a workout with logged sets to see trends.
                </p>
              }
            />

            {muscles.length > 0 && (
              <div className="mt-6 border-t border-hair pt-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="type-heading">Sets by muscle</h2>
                  <InfoTip label="About sets by muscle">
                    Working sets per week. A set counts once for each primary muscle and half for
                    each secondary one; warm-ups are excluded.
                  </InfoTip>
                </div>
                <div className="mt-2">
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
                </div>
                <ChartHead title="Working sets each week" note={weeksNote} />
                <InkBars
                  integral
                  points={asPoints((w) => (shownMuscle ? (w.muscles[shownMuscle] ?? 0) : 0))}
                  label={`Working sets for ${
                    shownMuscle ? MUSCLE_LABELS[shownMuscle] : "the muscle"
                  } each week: ${weeks
                    .map((w) => (shownMuscle ? (w.muscles[shownMuscle] ?? 0) : 0))
                    .join(", ")}`}
                  ends={weekEnds}
                />
              </div>
            )}
          </div>
        )}

        {tab === "running" && (
          <>
            <div className="mt-3">
              <SegmentedControl
                name="run-metric"
                aria-label="Running measurement"
                options={RUN_METRICS}
                value={runMetric}
                onChange={setRunMetric}
                columns={3}
              />
            </div>
            {runMetric === "pace" ? (
              <>
                <div className="mt-3">
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
                </div>
                <PaceChart points={pace.filter((p) => p.mode === paceMode)} />
              </>
            ) : weeks.length === 0 ? (
              <p className="mt-4 type-meta text-ink-2">No runs in this range.</p>
            ) : (
              <>
                <ChartHead
                  title={
                    runMetric === "distance" ? "Weekly distance (km)" : "Weekly duration (min)"
                  }
                  note={weeksNote}
                />
                <InkBars
                  points={asPoints((w) => (runMetric === "distance" ? w.runKm : w.runMinutes))}
                  label={`${
                    runMetric === "distance" ? "Weekly distance" : "Weekly duration"
                  }, ${weeks.length} weeks from ${formatIsoDay(weeks[0]!.date)}: ${weeks
                    .map((w) =>
                      runMetric === "distance" ? `${w.runKm} km` : formatMinutes(w.runMinutes),
                    )
                    .join(", ")}${lastWeek?.partial ? ", this week so far" : ""}`}
                  format={
                    runMetric === "duration"
                      ? (v) => (v >= 60 ? formatMinutes(v) : String(Math.round(v)))
                      : (v) => String(v)
                  }
                  ends={weekEnds}
                />
              </>
            )}

            <h2 className="caption-head mt-4">Runs</h2>
            {runs.length === 0 ? (
              <p className="type-meta text-ink-2">No runs in this range.</p>
            ) : (
              <ul>
                {runs.map((run, index) => (
                  <li key={run.id}>
                    <Link
                      href={run.href}
                      className={index === runs.length - 1 ? "run-row run-row-last" : "run-row"}
                    >
                      <span className="flex flex-wrap items-baseline justify-between gap-x-2.5">
                        <span className="whitespace-nowrap">
                          <span className="type-figure">{run.distanceKm}</span>{" "}
                          <span className="type-caption font-semibold text-ink-2">km</span>
                        </span>
                        <span className="whitespace-nowrap">
                          <span className="type-figure-s">{run.pace}</span>{" "}
                          <span className="type-caption font-semibold text-ink-2">/km</span>
                        </span>
                      </span>
                      <span className="meta-line plan-row-meta">
                        <span className="meta-fact">
                          <Glyph
                            name={run.environment === "Treadmill" ? "treadmill" : "outdoor"}
                            label={run.environment}
                            className="glyph-16"
                          />
                          <span>
                            {run.when} · {run.duration}
                          </span>
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
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
            <h2 className="caption-head mt-3.5">Body weight</h2>
            {bodyWeight.length > 0 ? (
              <>
                <div className="mt-0.5">
                  <Headline points={bodyWeight} unit={unit} size="xl" />
                </div>
                <BodyWeightChart points={bodyWeight} unit={unit} />
              </>
            ) : (
              <p className="type-meta text-ink-2">
                No readings in this range. Weight recorded when you finish a session appears here,
                and you can set it any day from Profile → Edit profile.
              </p>
            )}

            {/* Kept from the app, under the board's body weight: the muscles a week trained. */}
            <div className="mt-6 border-t border-hair pt-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="type-heading">Muscles this week</h2>
                <InfoTip label="About the body map">
                  Working sets from finished workouts. A set counts once for each primary muscle and
                  half for each secondary one; warm-ups are excluded.
                </InfoTip>
              </div>
              {/* Body keeps its own week navigation: it is a snapshot, not a trend. */}
              <div className="mt-1 flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-label="Previous week"
                  disabled={pending}
                  onClick={() => stepWeek(-7)}
                  className="session-icon-button -ml-2.5 disabled:text-ink-2"
                >
                  <Glyph name="chevronLeft" className="glyph-22" />
                </button>
                <p className="min-w-0 text-center type-meta font-semibold tabular-nums">
                  {formatDateRange(body.from, body.to)}
                </p>
                <button
                  type="button"
                  aria-label="Next week"
                  disabled={pending}
                  onClick={() => stepWeek(7)}
                  className="session-icon-button -mr-2.5 disabled:text-ink-2"
                >
                  <Glyph name="chevronRight" className="glyph-22" />
                </button>
              </div>
              <div className={pending ? "opacity-50 transition-opacity" : undefined}>
                <BodyMap volume={body.volume} totalSets={body.totalSets} />
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

// ---------- Overview: the month on paper ----------

const subscribeResize = (onChange: () => void) => {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
};

/**
 * The calendar's cells are as tall as the phone gives them (the generator's rule): 42 pt under
 * 360 wide, 44 on a short screen, 58 on a tall one, 50 otherwise.
 */
function useCellHeight(): number {
  const size = useSyncExternalStore(
    subscribeResize,
    () => `${window.innerWidth}x${window.innerHeight}`,
    () => "402x874",
  );
  const [width, height] = size.split("x").map(Number) as [number, number];
  return width < 360 ? 42 : height < 800 ? 44 : height >= 860 ? 58 : 50;
}

function Overview({
  month,
  range,
  truncated,
  sportTotals,
  lifting,
  running,
  weeksNote,
  weekEnds,
}: {
  month: Props["month"];
  range: string;
  truncated: boolean;
  sportTotals: Props["sportTotals"];
  lifting: InkPoint[];
  running: InkPoint[];
  weeksNote: string | null;
  weekEnds: [string, string] | undefined;
}) {
  const cellHeight = useCellHeight();
  const year = month.month.slice(0, 4);
  const name = formatIsoMonth(month.month, year);
  const days = monthDays(month.activities, month.month);
  const links = Object.fromEntries(
    Array.from({ length: month.today }, (_, i) => [
      i + 1,
      `/progress/day/${month.month}-${String(i + 1).padStart(2, "0")}` as Route,
    ]),
  );
  const tallies = tally(month.activities);
  const totals = (sportTotals ?? []).filter((total) => total.count > 0);

  return (
    <>
      <section aria-labelledby="progress-month" className="mt-2">
        <h2 id="progress-month" className="month-head">
          <span>{name}</span>
          <Link href="/progress/calendar" className="month-head-link">
            Calendar
            <Glyph name="chevronRight" className="glyph-18" />
          </Link>
        </h2>
        <Art
          kind="month"
          month={month.month}
          days={days}
          today={month.today}
          cellHeight={cellHeight}
          links={links}
          label={`${name} ${year}, every activity of every day`}
        />
      </section>

      {/* The month's totals, each led by its mark: the calendar's legend and its count at once. */}
      <section aria-labelledby="progress-month-totals" className="month-totals">
        <h2 id="progress-month-totals" className="sr-only">
          Sessions in {name}
        </h2>
        {tallies.length > 0 ? (
          <ul>
            {tallies.map((entry) => (
              <li key={entry.sport}>
                <span className="flex items-center gap-1.5">
                  <Art kind="mark" sport={ART_SPORT[entry.sport]} size={14} />
                  <span className="type-figure-l">{entry.count}</span>
                </span>
                <span className="month-total-name">
                  {tallyName(entry.sport, entry.count)}
                  {entry.metres !== null && (
                    <>
                      <br />
                      {tallyDistance(entry.metres)}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-meta text-ink-2">Nothing logged in {name} yet.</p>
        )}
      </section>

      {/* Kept from the app, under the month (decided with the owner): the range's totals and
          its weeks, for the dates the filters choose. */}
      <section aria-labelledby="progress-range" className="mt-6 border-t border-hair pt-3">
        <h2 id="progress-range" className="caption-head">
          {range}
        </h2>
        {truncated && (
          <p role="status" className="mt-1 type-meta text-ink-2">
            Over 500 workouts or runs in this range; the charts below draw a sample. The training
            totals are complete.
          </p>
        )}
        {totals.length > 0 && (
          <>
            <div className="mt-2 flex items-center justify-between gap-3">
              <h3 className="type-heading">Training totals</h3>
              <InfoTip label="What these totals count">
                Every activity in this range, counted in full rather than sampled. Recorded training
                time, not unique wall-clock time: overlapping sessions are counted once each.
                Distance is per sport and never added across them.
              </InfoTip>
            </div>
            <ul>
              {totals.map((total, index) => (
                <li
                  key={total.sport}
                  className={index === totals.length - 1 ? "total-row plan-row-last" : "total-row"}
                >
                  <span className="mark-cell">
                    <Art
                      kind="mark"
                      sport={ART_SPORT[total.sport as DayActivity["sport"]] ?? "strength"}
                      size={16}
                    />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="plan-row-name">{total.label}</span>
                    <span className="type-meta-small text-ink-2 tabular-nums">
                      {total.count} {total.count === 1 ? "session" : "sessions"} · {total.days}{" "}
                      {total.days === 1 ? "day" : "days"} ·{" "}
                      {formatMinutes(total.durationMs / 60_000)}
                      {total.distanceMetres !== null && total.distanceMetres > 0
                        ? ` · ${Math.round(total.distanceMetres / 100) / 10} km`
                        : ""}
                    </span>
                    {/* What the totals could not include, said rather than hidden. */}
                    {(total.unknownDistances > 0 || total.unknownDurations > 0) && (
                      <span className="type-caption font-medium text-ink-2">
                        {[
                          total.unknownDistances > 0
                            ? `${total.unknownDistances} without a distance`
                            : null,
                          total.unknownDurations > 0
                            ? `${total.unknownDurations} without a duration`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {lifting.length > 0 && (
          <>
            <div className="mt-4 flex items-center justify-between gap-3">
              <h3 className="type-heading">Weekly sessions</h3>
              <InfoTip label="About weekly sessions">
                Weeks run Monday to Sunday in your time zone. The charts end at the last week you
                trained in, not at today, so they never finish on an empty column. A week still
                running is drawn in ink even before anything is in it.
              </InfoTip>
            </div>
            <ChartHead title="Lifting" note={weeksNote} />
            <InkBars
              integral
              height={96}
              points={lifting}
              label={`Lifting sessions each week: ${lifting.map((p) => p.value ?? 0).join(", ")}`}
              ends={weekEnds}
            />
            <ChartHead title="Runs" />
            <InkBars
              integral
              height={96}
              points={running}
              label={`Runs each week: ${running.map((p) => p.value ?? 0).join(", ")}`}
              ends={weekEnds}
            />
          </>
        )}
      </section>
    </>
  );
}

// ---------- Running: pace ----------

function PaceChart({ points }: { points: { date: string; value: number | null }[] }) {
  const known = points.filter((point) => point.value !== null);
  if (known.length === 0)
    return <p className="mt-4 type-meta text-ink-2">No runs with a pace in this range.</p>;
  const first = known[0]!;
  const last = known.at(-1)!;
  return (
    <>
      <ChartHead title="Pace (min/km)" note="Lower is faster" />
      <InkLine
        points={points}
        label={`Pace per run, ${known.length} runs from ${formatIsoDay(first.date)} to ${formatIsoDay(
          last.date,
        )}, latest ${paceLabel(last.value!)} per kilometre`}
        format={paceLabel}
        ends={[formatIsoShortDay(first.date), formatIsoShortDay(last.date)]}
      />
      <ChartValues
        rows={[...known].reverse().map((point, index) => ({
          key: `${point.date}-${index}`,
          date: formatIsoDay(point.date),
          value: `${paceLabel(point.value!)} /km`,
        }))}
      />
    </>
  );
}

// ---------- Body: the weight ----------

function BodyWeightChart({ points, unit }: { points: Point[]; unit: BodyLoadUnit }) {
  const known = points.filter((point) => point.value !== null);
  const first = known[0];
  const last = known.at(-1);
  if (!first || !last) return null;
  const round = (value: number) => Math.round(value * 10) / 10;
  return (
    <>
      <InkLine
        className="mt-2"
        points={points}
        label={`Body weight, ${known.length} ${
          known.length === 1 ? "reading" : "readings"
        } from ${formatIsoDay(first.date)} to ${formatIsoDay(last.date)}, from ${round(
          first.value!,
        )} to ${round(last.value!)} ${unit}`}
        format={(value) => String(round(value))}
        ends={[formatIsoShortDay(first.date), formatIsoShortDay(last.date)]}
      />
      <ChartValues
        rows={[...known].reverse().map((point, index) => ({
          key: `${point.date}-${index}`,
          date: formatIsoDay(point.date),
          value: `${round(point.value!)} ${unit}`,
        }))}
      />
    </>
  );
}
