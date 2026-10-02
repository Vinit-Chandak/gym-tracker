"use client";

import { ChevronDown } from "@/components/ui/icons";
import { useEffect, useId, useRef, useState } from "react";

import type { Point } from "@/domain/analytics";
import { formatIsoDate, formatIsoDay } from "@/lib/format";
import { cn } from "@/lib/utils";

import { InfoTip } from "./info-tip";

/**
 * Series marks come from the theme, so the same chart is legible on either sheet: series 1 is
 * the ink and series 2 the pen, each carrying a separately chosen value per mode rather than
 * one hex that was only ever checked against one canvas. Assignments stay fixed — lifting is
 * always the ink, running always the pen — and every series is labelled, so colour never
 * carries the meaning alone.
 */
export const SERIES_COLORS = {
  lifting: "var(--ov-series-1)",
  running: "var(--ov-series-2)",
} as const;

export type ChartSeries = {
  name: string;
  color: string;
  points: readonly Point[];
};

type ChartProps = {
  title: string;
  unit: string;
  series: readonly ChartSeries[];
  /**
   * Bars suit counts and totals per week: those are magnitudes, read as a length from zero,
   * and a line drawn between two weekly totals claims the values in between were passed
   * through. Lines suit a measurement tracked over time, where the shape is the point.
   * Bars are also placed by slice and lines by date, which is the other half of the choice.
   */
  kind?: "line" | "bar";
  /**
   * Bars encode magnitude by length and always start at zero. A line encodes change,
   * and forcing zero flattens the trend, so lines default to the data's own range.
   */
  baseline?: "zero" | "auto";
  /** Fixed bounds for a known rating scale, such as recovery's 1–5 scores. */
  valueRange?: { min: number; max: number };
  format?: (value: number) => string;
  height?: number;
  /** Anything the reader needs to read the chart correctly; behind a tip, not under it. */
  note?: string;
  /**
   * Whether the chart names itself. Off when a heading, headline or control just above
   * already says what it is, so the same words are not printed twice.
   */
  caption?: boolean;
  /**
   * Draw a line straight across a null rather than breaking it there. For one person's
   * readings a gap is a missing measurement and the break is honest; when two people share
   * one date axis, a null is only the other person's training day, and a break would leave
   * both lines in pieces.
   */
  bridgeGaps?: boolean;
};

/**
 * Splits a series at nulls so a missing reading breaks the line instead of bridging it —
 * or, with `bridge`, keeps the known points as one run.
 */
export function chartSegments(
  points: readonly Point[],
  bridge = false,
): { i: number; value: number }[][] {
  const runs: { i: number; value: number }[][] = [];
  let run: { i: number; value: number }[] = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      if (!bridge && run.length) {
        runs.push(run);
        run = [];
      }
    } else run.push({ i, value: p.value });
  });
  if (run.length) runs.push(run);
  return runs;
}

const PAD = { top: 10, right: 12, bottom: 22, left: 40 };

/**
 * Round tick steps (1, 2, 2.5, 5, 10 x powers of ten) so axis labels read cleanly.
 * Counts drop the 2.5 step: on a 0-10 axis it yields 2.5 and 7.5, which round to
 * "3" and "8" and look like the axis is lying.
 *
 * The run always reaches past `max`. Stopping short of it leaves the tallest mark standing
 * above every labelled line with nothing to read it against — twelve working sets over an
 * axis that ended at ten — so the top tick is the top of the plot.
 */
export function niceTicks(min: number, max: number, count = 4, integral = false): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (min === max) return [min];
  const raw = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const steps = integral && magnitude < 1 ? [1] : integral ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  const step = steps.map((m) => m * magnitude).find((s) => s >= raw) ?? magnitude * 10;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let t = start; ticks.length < 64; t += step) {
    const value = Math.round(t * 1000) / 1000;
    ticks.push(value);
    if (value >= max) break;
  }
  return ticks;
}

/** Day number for an ISO civil date, so a line can be spaced by real elapsed time. */
const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

/**
 * Which observations get a date printed under them: walking left to right, one whenever
 * there is room since the last, and the final one always — the end of a chart is the part
 * a reader looks at first, and two labels across a quarter left everything between them
 * unplaceable in time without hovering it.
 */
export function labelIndices(positions: readonly number[], minGap = 44): number[] {
  const last = positions.length - 1;
  if (last < 1) return positions.length ? [0] : [];
  const picked = [0];
  for (let i = 1; i < last; i++)
    if (positions[i]! - positions[picked[picked.length - 1]!]! >= minGap) picked.push(i);
  while (picked.length > 1 && positions[last]! - positions[picked[picked.length - 1]!]! < minGap)
    picked.pop();
  picked.push(last);
  return picked;
}

const shortDate = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}`;
};

/**
 * The key a legend or a tooltip gives a series: the mark itself, small. A bar's key is a
 * square of its fill; a line's is a short stroke of it.
 */
function SeriesKey({ color, kind }: { color: string; kind: "line" | "bar" }) {
  return kind === "bar" ? (
    <span className="size-2.5 shrink-0" style={{ background: color }} aria-hidden />
  ) : (
    <span className="h-0.5 w-3 shrink-0" style={{ background: color }} aria-hidden />
  );
}

/**
 * A time series drawn the way a printed training chart is: hairline axes, a dotted grid, the
 * series in ink (and the second in pen) with square ends, bars with square corners held a
 * pixel apart. Points appear only under the finger, where the date and the value are
 * printed on a small panel; the latest whole figure is set over its bar in the data voice.
 * Everything drawn is also in the table beneath, newest first.
 */
export function Chart({
  title,
  unit,
  series,
  kind = "line",
  baseline,
  valueRange,
  format = (v) => String(Math.round(v * 10) / 10),
  height = 200,
  note,
  caption = true,
  bridgeGaps = false,
}: ChartProps) {
  const holder = useRef<HTMLDivElement>(null);
  // Width is measured after mount: the server cannot know it, and guessing would
  // make the first client render disagree with the server's HTML.
  const [width, setWidth] = useState(0);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  // Several charts share one screen, so the hatch each one defines needs its own name.
  const patternId = useId();

  const dates = series[0]?.points.map((p) => p.date) ?? [];
  // A filter can replace the series while a touch tooltip is still open. Track the
  // observation itself so a shorter range cannot reuse an invalid array index.
  const activeIndex = activeDate === null ? -1 : dates.indexOf(activeDate);
  const active = activeIndex < 0 ? null : activeIndex;
  const known = series.flatMap((s) =>
    s.points.filter((p) => p.value !== null).map((p) => p.value!),
  );
  const empty = known.length === 0;

  // An empty chart has no holder. Start observing when readings create one, and also
  // when a date/metric change removes and later recreates it.
  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [empty]);

  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const zeroBased = (baseline ?? (kind === "bar" ? "zero" : "auto")) === "zero";
  const lo = valueRange?.min ?? (zeroBased ? Math.min(0, ...known) : Math.min(...known));
  const hi = valueRange?.max ?? Math.max(...known);
  const integral = known.every((v) => Number.isInteger(v));
  const ticks = niceTicks(lo, hi === lo ? lo + 1 : hi, 4, integral);
  // The ticks reach past the data at both ends, so the axis is exactly the plot.
  const yMin = ticks[0]!;
  const yMax = ticks[ticks.length - 1]!;
  const y = (v: number) => PAD.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

  /**
   * Bars own a slice of the axis and stand in the middle of it, so neither the first nor
   * the last is half-drawn over the gutter it sits beside. A line is placed on the date
   * itself: four weeks off has to occupy four weeks of the axis, or a lay-off reads with
   * the same slope as a good week. The two never mix — bar dates are calendar weeks, which
   * are evenly spaced anyway, so a band and a date axis agree there.
   */
  const band = dates.length > 0 ? plotW / dates.length : plotW;
  const days = dates.map(dayNumber);
  // Measured from the ends of the range rather than the ends of the array: every caller
  // sorts, and one that did not would otherwise draw off the plot instead of merely
  // zigzagging where its own data does.
  const earliest = days.length ? Math.min(...days) : 0;
  const span = dates.length > 1 ? Math.max(...days) - earliest : 0;
  const x = (i: number) =>
    kind === "bar"
      ? PAD.left + (i + 0.5) * band
      : span > 0
        ? PAD.left + ((days[i]! - earliest) / span) * plotW
        : PAD.left + plotW / 2;
  const positions = dates.map((_, i) => x(i));

  const segments = (points: readonly Point[]) => chartSegments(points, bridgeGaps);

  // Nearest observation to the pointer. Points are no longer a fixed step apart, so the
  // index cannot be divided out of the offset; the hit area is whatever is closest, which
  // is also what a dense stretch of sessions needs.
  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!plotW || dates.length === 0) return;
    const local = event.clientX - event.currentTarget.getBoundingClientRect().left;
    let nearest = 0;
    for (let i = 1; i < positions.length; i++)
      if (Math.abs(positions[i]! - local) < Math.abs(positions[nearest]! - local)) nearest = i;
    setActiveDate(dates[nearest]!);
  };

  if (empty) {
    return (
      <figure className="space-y-1">
        <figcaption className="text-sm font-medium">
          {title} <span className="text-ink-muted">({unit})</span>
        </figcaption>
        <p className="py-6 text-center text-sm text-ink-muted">
          Nothing recorded for {title.toLowerCase()} in this range.
        </p>
      </figure>
    );
  }

  const multi = series.length > 1;
  const hasPartial = series.some((s) => s.points.some((p) => p.partial));
  /** Marked wherever the numbers are read, not only where they are drawn. */
  const partialAt = (i: number) => series.some((s) => s.points[i]?.partial);
  // A bar is at most 24px thick, a pair at most 14px each, and the bars of a group are held
  // apart by one pixel of the sheet rather than by a stroke drawn around each; the rest of
  // the slice is air either side.
  const slotCap = series.length === 1 ? 24 : 14;
  const groupWidth = Math.max(
    4,
    Math.min(band - 6, series.length * slotCap + (series.length - 1)),
  );
  const slot = Math.max(2, (groupWidth - (series.length - 1)) / series.length);
  // The newest whole observation, for the figure printed over it. Only on a single run of
  // bars: over a pair, or over a line that already has a headline above it, it is clutter.
  // A bar that reaches the top tick leaves no room above itself, and the figure is in the
  // tooltip and the table either way, so it is dropped rather than set over the fill.
  const endCandidate =
    kind === "bar" && series.length === 1
      ? series[0]!.points.reduce((found, p, i) => (p.value !== null && !p.partial ? i : found), -1)
      : -1;
  const endIndex =
    endCandidate >= 0 && y(series[0]!.points[endCandidate]!.value!) - 7 >= PAD.top + 1
      ? endCandidate
      : -1;
  // Indices into the ascending series, walked backwards, so the table reads latest first
  // while every lookup still points at the same observation the chart drew.
  const newestFirst = dates.map((_, i) => dates.length - 1 - i);

  return (
    <figure className="space-y-2">
      {(caption || note || multi) && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="flex min-w-0 items-center gap-1">
            <figcaption className={cn("text-sm font-medium", !caption && "sr-only")}>
              {title} <span className="text-ink-muted">({unit})</span>
            </figcaption>
            {note && <InfoTip label={`About ${title.toLowerCase()}`}>{note}</InfoTip>}
          </span>
          {multi && (
            <ul className="flex min-w-0 flex-wrap gap-x-3 gap-y-1">
              {series.map((s) => (
                <li
                  key={s.name}
                  className="flex min-w-0 items-center gap-1.5 text-xs text-ink-muted"
                >
                  <SeriesKey color={s.color} kind={kind} />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{s.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div ref={holder} className="relative" style={{ height }}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`${title}, ${known.length} observations${hasPartial ? ", the last of them still in progress" : ""}. Values available in the table below.`}
            className="touch-pan-y overflow-visible select-none"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setActiveDate(null)}
          >
            {/* The grid: a dotted hairline at every tick, the baseline and the axis solid. */}
            {ticks.map((t, k) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--color-line)"
                  strokeWidth="1"
                  strokeDasharray={k === 0 ? undefined : "1 3"}
                />
                <text
                  x={PAD.left - 6}
                  y={y(t) + 3.5}
                  textAnchor="end"
                  fontSize="11"
                  fill="var(--color-ink-subtle)"
                  className="font-data tabular-nums"
                >
                  {format(t)}
                </text>
              </g>
            ))}
            <line
              x1={PAD.left}
              x2={PAD.left}
              y1={y(yMax)}
              y2={y(yMin)}
              stroke="var(--color-line)"
              strokeWidth="1"
            />

            {hasPartial && (
              <defs>
                {series.map((s, si) => (
                  /* 45 degrees, in the series' own colour on the sheet: a part-week is
                     told apart from a whole one without being given a second hue. */
                  <pattern
                    key={s.name}
                    id={`${patternId}-${si}`}
                    patternUnits="userSpaceOnUse"
                    width="6"
                    height="6"
                    patternTransform="rotate(45)"
                  >
                    <rect width="6" height="6" fill="var(--color-canvas)" />
                    <line
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="6"
                      stroke={s.color}
                      strokeWidth="3"
                      opacity="0.5"
                    />
                  </pattern>
                ))}
              </defs>
            )}

            {series.map((s, si) =>
              kind === "bar" ? (
                <g key={s.name}>
                  {s.points.map((p, i) =>
                    p.value === null ? null : (
                      <rect
                        key={`${s.name}:${i}`}
                        x={x(i) - groupWidth / 2 + si * (slot + 1)}
                        y={y(p.value)}
                        width={slot}
                        height={Math.max(0, y(yMin) - y(p.value))}
                        fill={p.partial ? `url(#${patternId}-${si})` : s.color}
                        stroke={p.partial ? s.color : undefined}
                        strokeWidth={p.partial ? 1 : undefined}
                        opacity={active === null || active === i ? 1 : 0.55}
                      />
                    ),
                  )}
                </g>
              ) : (
                <g key={s.name}>
                  {segments(s.points).map((run, r) =>
                    run.length === 1 ? (
                      /* A reading on its own has no line to be part of, so it is a mark:
                         a small square of the series, the way the line's ends are square. */
                      <rect
                        key={`${s.name}:${r}`}
                        x={x(run[0]!.i) - 2.5}
                        y={y(run[0]!.value) - 2.5}
                        width="5"
                        height="5"
                        fill={s.color}
                      />
                    ) : (
                      <path
                        key={`${s.name}:${r}`}
                        d={run.map((p, k) => `${k ? "L" : "M"}${x(p.i)},${y(p.value)}`).join(" ")}
                        fill="none"
                        stroke={s.color}
                        strokeWidth="2"
                        strokeLinecap="square"
                        strokeLinejoin="bevel"
                      />
                    ),
                  )}
                  {/* The point appears under the finger: a dot of the series ringed with the
                      sheet, so it reads where the lines cross. */}
                  {active !== null &&
                    s.points[active] !== undefined &&
                    s.points[active]!.value !== null && (
                      <circle
                        cx={x(active)}
                        cy={y(s.points[active]!.value!)}
                        r="4"
                        fill={s.color}
                        stroke="var(--color-canvas)"
                        strokeWidth="2"
                      />
                    )}
                </g>
              ),
            )}

            {active !== null && (
              <line
                x1={x(active)}
                x2={x(active)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="var(--color-line-strong)"
                strokeWidth="1"
              />
            )}

            {/*
              The latest finished figure, printed once. A number on every mark goes unread,
              and the one a reader came for is the one at the end of the line.
            */}
            {endIndex >= 0 && (
              <text
                x={x(endIndex)}
                y={y(series[0]!.points[endIndex]!.value!) - 6}
                textAnchor="middle"
                fontSize="12"
                fontWeight="600"
                fill="var(--color-ink)"
                className="font-data tabular-nums"
              >
                {format(series[0]!.points[endIndex]!.value!)}
              </text>
            )}

            {labelIndices(positions).map((i) =>
              dates[i] ? (
                <text
                  key={`x:${i}`}
                  x={
                    dates.length === 1
                      ? x(0)
                      : i === 0
                        ? PAD.left
                        : i === dates.length - 1
                          ? width - PAD.right
                          : x(i)
                  }
                  y={height - 6}
                  textAnchor={
                    dates.length === 1
                      ? "middle"
                      : i === 0
                        ? "start"
                        : i === dates.length - 1
                          ? "end"
                          : "middle"
                  }
                  fontSize="11"
                  fill="var(--color-ink-subtle)"
                  className="font-data tabular-nums"
                >
                  {shortDate(dates[i]!)}
                </text>
              ) : null,
            )}
          </svg>
        )}

        {active !== null && dates[active] && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 max-w-full panel px-2 py-1 text-xs [overflow-wrap:anywhere]"
            style={{
              left: Math.max(0, Math.min(width - Math.min(width, 240), x(active) - 120)),
              width: Math.min(width, 240),
            }}
          >
            <p className="font-data font-semibold text-ink tabular-nums">
              {formatIsoDate(dates[active]!)}
              {partialAt(active) && <span className="font-normal text-ink-muted"> · so far</span>}
            </p>
            {series.map((s) => (
              <p
                key={s.name}
                className="flex min-w-0 flex-wrap items-center gap-x-1.5 tabular-nums"
              >
                {multi && <SeriesKey color={s.color} kind={kind} />}
                <span className="min-w-0 font-data text-sm font-semibold">
                  {s.points[active]?.value === null || s.points[active] === undefined
                    ? "—"
                    : format(s.points[active]!.value!)}
                </span>
                <span className="min-w-0 text-ink-muted">{multi ? s.name : unit}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      {/*
        The same numbers as a table, newest first: a reader who opens this is looking for
        what happened most recently, and scrolling back through a year to reach last week is
        not reading. It grows to its full height rather than scrolling inside a box of its
        own — a scroll region nested in a scrolling page traps the gesture, and its bar
        lands on top of the right-hand column.
      */}
      <details className="group text-xs text-ink-muted">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 font-medium select-none">
          <ChevronDown
            className="shrink-0 transition-transform duration-[var(--ov-duration-feedback)] group-open:rotate-180"
            aria-hidden
          />
          View values
          {/* Several charts on one screen: a screen reader's list of controls tells them apart. */}
          <span className="sr-only"> for {title}</span>
        </summary>
        <table className="w-full table-fixed text-left [overflow-wrap:anywhere] tabular-nums">
          <caption className="sr-only">{title} by date, newest first</caption>
          <thead>
            <tr className="text-ink-subtle">
              <th scope="col" className="py-1.5 font-medium">
                Date
              </th>
              {series.map((s) => (
                <th scope="col" key={s.name} className="py-1.5 text-right font-medium">
                  {multi ? s.name : unit}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {newestFirst.map((i) => (
              <tr
                key={`${dates[i]}:${i}`}
                className={cn("border-t border-line", active === i && "text-ink")}
              >
                <th scope="row" className="py-1.5 font-normal">
                  {formatIsoDay(dates[i]!)}
                  {partialAt(i) && <span className="text-ink-subtle"> · so far</span>}
                </th>
                {series.map((s) => (
                  <td key={s.name} className="py-1.5 text-right font-data">
                    {s.points[i]?.value === null || s.points[i] === undefined
                      ? "—"
                      : format(s.points[i]!.value!)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
