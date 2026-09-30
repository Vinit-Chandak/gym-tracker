"use client";

import Link from "@/components/ui/app-link";
import { Card } from "@/components/ui/card";
import { Chart } from "@/components/ui/chart";
import { Rest } from "@/components/ui/icons";
import type { RecoveryReading } from "@/domain/recovery";
import { formatIsoDay } from "@/lib/format";
import { TONE_SOFT } from "@/lib/sport-tone";
import { cn } from "@/lib/utils";

/**
 * What the check-in asks. Energy is not charted: it is no longer asked, being fatigue the
 * other way up, and a measure only older check-ins can fill would read as one that stopped.
 */
export const RECOVERY_METRICS = [
  { value: "sleepHours", label: "Sleep", unit: "h", hint: "Hours slept before training." },
  { value: "sleepQuality", label: "Sleep quality", unit: "/ 5", hint: "1 is poor, 5 is great." },
  { value: "fatigue", label: "Fatigue", unit: "/ 5", hint: "1 is fresh, 5 is wrecked." },
  { value: "soreness", label: "Soreness", unit: "/ 5", hint: "1 is none, 5 is severe." },
] as const;
type RecoveryMetric = (typeof RECOVERY_METRICS)[number]["value"];
const format = (value: number) => String(Math.round(value * 100) / 100);

/** Recovery is not a sport, but it has a hue of its own, and its chart is drawn in it. */
const RECOVERY_COLOR = "var(--ov-rose)";

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
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-control",
              TONE_SOFT.rose,
            )}
          >
            <Rest />
          </span>
          <h2 className="text-headline font-semibold">No check-ins in this range</h2>
        </div>
        <p className="text-sm text-ink-muted">
          Sleep, fatigue and soreness appear here when you save a workout check-in, even before you
          finish the workout. Blank answers stay blank. Try a wider date range, or add a check-in
          from your current workout.
        </p>
        <Link href="/today" className="inline-flex min-h-11 items-center font-semibold text-accent">
          Go to Today
        </Link>
      </Card>
    );

  return (
    <>
      <p className="px-1 text-sm text-ink-muted tabular-nums">
        {readings.length} {readings.length === 1 ? "check-in" : "check-ins"} in this range
      </p>
      {/* One tile per measure with its latest reading; the chosen one takes recovery's wash. */}
      <div
        role="radiogroup"
        aria-label="Recovery measurement"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {RECOVERY_METRICS.map((item) => {
          const recent = readings.findLast((reading) => reading[item.value] !== null);
          const chosen = metric.value === item.value;
          return (
            <label key={item.value} className="relative min-w-0">
              <input
                type="radio"
                name="recovery-metric"
                value={item.value}
                aria-label={item.label}
                checked={chosen}
                onChange={() => onSelect(item.value)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "flex h-full min-h-24 pressable cursor-pointer flex-col justify-between gap-2 rounded-tile p-4 peer-focus-visible:ring-2 peer-focus-visible:ring-focus",
                  chosen ? TONE_SOFT.rose : "bg-surface text-ink-muted",
                )}
              >
                <span className="text-sm font-semibold">{item.label}</span>
                <span className="text-ink tabular-nums">
                  {recent ? (
                    <>
                      <span className="font-display text-display-m font-extrabold">
                        {format(recent[item.value]!)}
                      </span>{" "}
                      <span className="text-sm font-semibold text-ink-muted">{item.unit}</span>
                    </>
                  ) : (
                    <span className="text-sm text-ink-muted">Not logged</span>
                  )}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-headline font-semibold">{metric.label}</h2>
          <span className="text-sm text-ink-muted tabular-nums">
            {known.length} {known.length === 1 ? "reading" : "readings"}
          </span>
        </div>
        <p className="-mt-2 text-sm text-ink-muted">{metric.hint}</p>
        {latest && average !== null ? (
          <>
            <dl aria-label={`${metric.label} summary`} className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <dt className="text-sm font-semibold text-ink-muted">Latest</dt>
                <dd className="mt-1 tabular-nums">
                  <span className="font-display text-display-m font-extrabold">
                    {format(latest[metric.value]!)}
                  </span>{" "}
                  <span className="text-sm font-semibold text-ink-muted">{metric.unit}</span>
                </dd>
                <dd className="mt-1 text-xs text-ink-subtle">{formatIsoDay(latest.date)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-sm font-semibold text-ink-muted">Range average</dt>
                <dd className="mt-1 tabular-nums">
                  <span className="font-display text-display-m font-extrabold">
                    {format(average)}
                  </span>{" "}
                  <span className="text-sm font-semibold text-ink-muted">{metric.unit}</span>
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
                  color: RECOVERY_COLOR,
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
      <section aria-labelledby="recent-check-ins" className="space-y-2">
        <h2 id="recent-check-ins" className="px-1 text-headline font-semibold">
          Recent check-ins
        </h2>
        <ul className="box-rows">
          {readings
            .slice(-3)
            .reverse()
            .map((reading) => (
              <li
                key={`${reading.source}:${reading.id}`}
                className="flex min-h-16 items-center justify-between gap-3 px-4 py-2"
              >
                <div className="min-w-0">
                  {reading.sessionId ? (
                    <Link
                      href={`/workouts/${reading.sessionId}`}
                      className="inline-flex min-h-11 items-center font-semibold text-accent"
                    >
                      {formatIsoDay(reading.date)}
                    </Link>
                  ) : (
                    <p className="font-semibold">{formatIsoDay(reading.date)}</p>
                  )}
                  <p className="text-sm text-ink-muted">
                    {reading.source === "workout" ? "Workout check-in" : "Daily recovery"}
                  </p>
                </div>
                <p className="shrink-0 text-right tabular-nums">
                  <span className="block text-xs text-ink-muted">{metric.label}</span>
                  {reading[metric.value] === null ? (
                    <span className="text-sm text-ink-muted">Not logged</span>
                  ) : (
                    <>
                      <span className="font-display text-display-s font-extrabold">
                        {format(reading[metric.value]!)}
                      </span>{" "}
                      <span className="text-sm font-semibold text-ink-muted">{metric.unit}</span>
                    </>
                  )}
                </p>
              </li>
            ))}
        </ul>
      </section>
    </>
  );
}
