"use client";

import Link from "@/components/ui/app-link";
import { Card } from "@/components/ui/card";
import { Chart, SERIES_COLORS } from "@/components/ui/chart";
import type { RecoveryReading } from "@/domain/recovery";
import { formatIsoDay } from "@/lib/format";

/**
 * What the check-in asks. Energy is not charted: it is no longer asked, being fatigue the
 * other way up, and a measure only older check-ins can fill would read as one that stopped.
 */
export const RECOVERY_METRICS = [
  { value: "sleepHours", label: "Sleep", unit: "h", hint: "Hours slept before training." },
  { value: "sleepQuality", label: "Sleep quality", unit: "/ 5", hint: "1 = poor · 5 = great" },
  { value: "fatigue", label: "Fatigue", unit: "/ 5", hint: "1 = fresh · 5 = wrecked" },
  { value: "soreness", label: "Soreness", unit: "/ 5", hint: "1 = none · 5 = severe" },
] as const;
type RecoveryMetric = (typeof RECOVERY_METRICS)[number]["value"];
const format = (value: number) => String(Math.round(value * 100) / 100);

export function RecoveryProgress({
  readings,
  selected,
  onSelect,
}: {
  readings: readonly RecoveryReading[];
  selected: string | null;
  onSelect: (metric: RecoveryMetric) => void;
}) {
  const metric =
    RECOVERY_METRICS.find((item) => item.value === selected) ??
    RECOVERY_METRICS.find((item) => readings.some((reading) => reading[item.value] !== null)) ??
    RECOVERY_METRICS[0];
  const known = readings.filter((reading) => reading[metric.value] !== null);
  const latest = known.at(-1);
  const average = known.length
    ? known.reduce((sum, reading) => sum + reading[metric.value]!, 0) / known.length
    : null;

  if (readings.length === 0)
    return (
      <Card>
        <h2 className="text-lg font-medium">No check-ins in this range</h2>
        <p className="text-sm text-ink-muted">
          Sleep, fatigue and soreness appear here when you save a workout check-in, even before you
          finish the workout. Blank answers stay blank.
        </p>
        <p className="text-sm text-ink-muted">
          Try a wider date range, or add a check-in from your current workout.
        </p>
        <Link href="/today" className="inline-flex min-h-11 items-center font-medium text-accent">
          Go to Today
        </Link>
      </Card>
    );

  return (
    <>
      <div>
        <p className="text-sm text-ink-muted">
          {readings.length} {readings.length === 1 ? "check-in" : "check-ins"} in this range
        </p>
        <p className="mt-1 text-xs text-ink-subtle">Latest readings · select a measure</p>
      </div>
      <div
        role="radiogroup"
        aria-label="Recovery measurement"
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {RECOVERY_METRICS.map((item) => {
          const recent = readings.findLast((reading) => reading[item.value] !== null);
          return (
            <label key={item.value} className="relative min-w-0">
              <input
                type="radio"
                name="recovery-metric"
                value={item.value}
                aria-label={item.label}
                checked={metric.value === item.value}
                onChange={() => onSelect(item.value)}
                className="peer sr-only"
              />
              <span className="flex h-full min-h-20 cursor-pointer flex-col gap-1 rounded-control border border-line-strong bg-surface px-3 py-2 peer-checked:border-accent peer-checked:bg-accent-soft peer-focus-visible:ring-2 peer-focus-visible:ring-focus">
                <span className="text-sm font-medium">{item.label}</span>
                <span className="text-lg tabular-nums">
                  {recent ? format(recent[item.value]!) : "—"}
                  <span className="ml-1 text-xs text-ink-muted">
                    {recent ? item.unit : "Not logged"}
                  </span>
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-medium">{metric.label}</h2>
          <span className="text-xs text-ink-muted">
            {known.length} {known.length === 1 ? "reading" : "readings"}
          </span>
        </div>
        <p className="text-sm text-ink-muted">{metric.hint}</p>
        {latest && average !== null ? (
          <>
            <dl
              aria-label={`${metric.label} summary`}
              className="grid grid-cols-2 gap-3 border-b border-line pb-3"
            >
              <div>
                <dt className="text-xs text-ink-muted">Latest</dt>
                <dd className="mt-1 text-2xl font-medium tabular-nums">
                  {format(latest[metric.value]!)}{" "}
                  <span className="text-sm font-normal text-ink-muted">{metric.unit}</span>
                </dd>
                <dd className="mt-1 text-xs text-ink-subtle">{formatIsoDay(latest.date)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Range average</dt>
                <dd className="mt-1 text-2xl font-medium tabular-nums">
                  {format(average)}{" "}
                  <span className="text-sm font-normal text-ink-muted">{metric.unit}</span>
                </dd>
                <dd className="mt-1 text-xs text-ink-subtle">From recorded answers only</dd>
              </div>
            </dl>
            <Chart
              title={metric.label}
              unit={metric.value === "sleepHours" ? "hours" : "1–5"}
              caption={false}
              height={220}
              format={format}
              valueRange={metric.value === "sleepHours" ? undefined : { min: 1, max: 5 }}
              series={[
                {
                  name: "Check-in",
                  color: SERIES_COLORS.lifting,
                  points: readings.map((reading) => ({
                    date: reading.date,
                    value: reading[metric.value],
                  })),
                },
              ]}
              note="Each point is one saved check-in, including open workouts. Blank answers leave gaps; multiple check-ins on one day stay separate."
            />
          </>
        ) : (
          <p className="py-4 text-sm text-ink-muted">
            {metric.label} was not recorded in these check-ins. Choose another measure or widen the
            date range.
          </p>
        )}
      </Card>
      <Card>
        <h2 className="font-medium">Recent check-ins</h2>
        <ul className="divide-y divide-line">
          {readings
            .slice(-3)
            .reverse()
            .map((reading) => (
              <li
                key={`${reading.source}:${reading.id}`}
                className="flex min-h-16 items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  {reading.sessionId ? (
                    <Link
                      href={`/workouts/${reading.sessionId}`}
                      className="inline-flex min-h-11 items-center font-medium text-accent"
                    >
                      {formatIsoDay(reading.date)}
                    </Link>
                  ) : (
                    <p className="font-medium">{formatIsoDay(reading.date)}</p>
                  )}
                  <p className="text-xs text-ink-muted">
                    {reading.source === "workout" ? "Workout check-in" : "Daily recovery"}
                  </p>
                </div>
                <p className="shrink-0 text-right text-sm tabular-nums">
                  <span className="block text-xs text-ink-muted">{metric.label}</span>
                  {reading[metric.value] === null
                    ? "Not logged"
                    : `${format(reading[metric.value]!)} ${metric.unit}`}
                </p>
              </li>
            ))}
        </ul>
      </Card>
    </>
  );
}
