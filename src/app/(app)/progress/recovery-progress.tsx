"use client";

import Link from "@/components/ui/app-link";
import { ChartValues, InkBars } from "@/components/ui/ink-chart";
import { SHORT_SLEEP_HOURS, type RecoveryReading } from "@/domain/recovery";
import { formatIsoDay } from "@/lib/format";
import { cn } from "@/lib/utils";

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

/**
 * Recovery (board Recovery): the four answers' latest readings to choose from, then the chosen
 * one as a bar for each reading, the latest in ink, sleep against the 6 h the check-in warns
 * under, and the range's average.
 */
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
  const average = known.length
    ? known.reduce((sum, reading) => sum + reading[metric.value]!, 0) / known.length
    : null;
  const sleep = metric.value === "sleepHours";

  if (readings.length === 0)
    return (
      <div className="mt-4">
        <h2 className="type-heading">No check-ins in this range</h2>
        <p className="mt-1 type-body text-ink-2">
          Sleep, fatigue and soreness appear here when you save a workout check-in, even before you
          finish the workout. Blank answers stay blank.
        </p>
        <p className="mt-1 type-body text-ink-2">
          Try a wider date range, or add a check-in from your current workout.
        </p>
        <Link
          href="/today"
          className="mt-2 inline-flex min-h-[var(--ov-target)] items-center font-bold underline underline-offset-4"
        >
          Go to Today
        </Link>
      </div>
    );

  return (
    <>
      <p className="mt-3 type-meta-small text-ink-2 tabular-nums">
        {readings.length} {readings.length === 1 ? "check-in" : "check-ins"} in this range
      </p>
      <div role="radiogroup" aria-label="Recovery measurement" className="recovery-tiles">
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
              <span className={cn("recovery-tile", chosen && "recovery-tile-chosen")}>
                <span className="type-meta-small font-bold">{item.label}</span>
                <span className="whitespace-nowrap">
                  <span className="type-figure-l">
                    {recent ? format(recent[item.value]!) : "—"}
                  </span>{" "}
                  <span className="recovery-tile-unit">{recent ? item.unit : "Not logged"}</span>
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <p className="mt-4 flex items-baseline justify-between gap-2">
        <span className="type-meta font-bold">{metric.label}</span>
        <span className="type-caption font-medium text-ink-2 tabular-nums">
          {known.length} {known.length === 1 ? "reading" : "readings"}
        </span>
      </p>
      {known.length > 0 && average !== null ? (
        <>
          <InkBars
            className="mt-2"
            height={150}
            months
            integral={!sleep}
            scaleMax={sleep ? 8 : undefined}
            rule={sleep ? { value: SHORT_SLEEP_HOURS, label: `${SHORT_SLEEP_HOURS} h` } : undefined}
            points={known.map((reading) => ({ date: reading.date, value: reading[metric.value] }))}
            label={`${metric.label}, ${known.length} ${
              known.length === 1 ? "reading" : "readings"
            } from ${formatIsoDay(known[0]!.date)} to ${formatIsoDay(known.at(-1)!.date)}; the latest ${format(
              known.at(-1)![metric.value]!,
            )} ${metric.unit}`}
            format={format}
          />
          <dl className="mt-3">
            <div>
              <dt className="type-caption font-semibold text-ink-2">Range average</dt>
              <dd className="mt-0.5 whitespace-nowrap">
                <span className="type-figure-l">{format(average)}</span>{" "}
                <span className="type-caption font-semibold text-ink-2">{metric.unit}</span>
              </dd>
              <dd className="type-caption font-medium text-ink-2">From recorded answers only</dd>
            </div>
          </dl>
          <p className="mt-2 type-caption font-medium text-ink-2">{metric.hint}</p>
          <ChartValues
            rows={[...known].reverse().map((reading) => ({
              key: `${reading.source}:${reading.id}`,
              date: `${formatIsoDay(reading.date)} · ${
                reading.source === "workout" ? "Workout check-in" : "Daily recovery"
              }`,
              value: `${format(reading[metric.value]!)} ${metric.unit}`,
            }))}
          />
        </>
      ) : (
        <p className="py-4 type-meta text-ink-2">
          {metric.label} was not recorded in these check-ins. Choose another measure or widen the
          date range.
        </p>
      )}

      {/* Kept from the app: the latest check-ins, each opening the workout it was given in. */}
      <h2 className="caption-head mt-5">Recent check-ins</h2>
      <ul>
        {readings
          .slice(-3)
          .reverse()
          .map((reading, index, shown) => (
            <li
              key={`${reading.source}:${reading.id}`}
              className={cn("total-row", index === shown.length - 1 && "plan-row-last")}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                {reading.sessionId ? (
                  <Link
                    href={`/workouts/${reading.sessionId}`}
                    className="plan-row-name underline-offset-4 hover:underline"
                  >
                    {formatIsoDay(reading.date)}
                  </Link>
                ) : (
                  <span className="plan-row-name">{formatIsoDay(reading.date)}</span>
                )}
                <span className="type-meta-small text-ink-2">
                  {reading.source === "workout" ? "Workout check-in" : "Daily recovery"}
                </span>
              </span>
              <span className="shrink-0 text-right type-meta font-semibold tabular-nums">
                {reading[metric.value] === null
                  ? "Not logged"
                  : `${format(reading[metric.value]!)} ${metric.unit}`}
              </span>
            </li>
          ))}
      </ul>
    </>
  );
}
