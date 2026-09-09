"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Point } from "@/domain/analytics";
import { formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Series marks come from the theme, so the same chart is legible on either canvas: the
 * tokens carry a separately validated colour per mode rather than one hex that was only
 * ever checked against the dark surface. Assignments stay fixed — lifting is always
 * series 1 — and every series is labelled, so colour never carries the meaning alone.
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
  /** Bars suit counts per week; lines suit a measurement tracked over time. */
  kind?: "line" | "bar";
  /**
   * Bars encode magnitude by length and always start at zero. A line encodes change,
   * and forcing zero flattens the trend, so lines default to the data's own range.
   */
  baseline?: "zero" | "auto";
  format?: (value: number) => string;
  height?: number;
  /** Says which way is better, for measurements where lower wins. */
  note?: string;
};

const PAD = { top: 10, right: 12, bottom: 22, left: 40 };

/**
 * Round tick steps (1, 2, 2.5, 5, 10 x powers of ten) so axis labels read cleanly.
 * Counts drop the 2.5 step: on a 0-10 axis it yields 2.5 and 7.5, which round to
 * "3" and "8" and look like the axis is lying.
 */
function niceTicks(min: number, max: number, count = 4, integral = false): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (min === max) return [min];
  const raw = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const steps = integral && magnitude < 1 ? [1] : integral ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  const step = steps.map((m) => m * magnitude).find((s) => s >= raw) ?? magnitude * 10;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= max + step / 2; t += step) ticks.push(Math.round(t * 1000) / 1000);
  return ticks;
}

const shortDate = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}`;
};

export function Chart({
  title,
  unit,
  series,
  kind = "line",
  baseline,
  format = (v) => String(Math.round(v * 10) / 10),
  height = 200,
  note,
}: ChartProps) {
  const holder = useRef<HTMLDivElement>(null);
  // Width is measured after mount: the server cannot know it, and guessing would
  // make the first client render disagree with the server's HTML.
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const dates = series[0]?.points.map((p) => p.date) ?? [];
  const known = series.flatMap((s) =>
    s.points.filter((p) => p.value !== null).map((p) => p.value!),
  );
  const empty = known.length === 0;

  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const zeroBased = (baseline ?? (kind === "bar" ? "zero" : "auto")) === "zero";
  const lo = zeroBased ? Math.min(0, ...known) : Math.min(...known);
  const hi = Math.max(...known);
  const integral = known.every((v) => Number.isInteger(v));
  const ticks = niceTicks(lo, hi === lo ? lo + 1 : hi, 4, integral);
  const yMin = Math.min(lo, ticks[0]!);
  const yMax = Math.max(hi, ticks[ticks.length - 1]!);
  const y = (v: number) => PAD.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;
  // Evenly spaced by observation: sessions are irregular, and real gaps would
  // squash a busy fortnight into a sliver next to one lonely point.
  const step = dates.length > 1 ? plotW / (dates.length - 1) : 0;
  const x = (i: number) => PAD.left + (dates.length > 1 ? i * step : plotW / 2);

  /** Splits a series at nulls so a missing reading breaks the line instead of bridging it. */
  const segments = (points: readonly Point[]) => {
    const runs: { i: number; value: number }[][] = [];
    let run: { i: number; value: number }[] = [];
    points.forEach((p, i) => {
      if (p.value === null) {
        if (run.length) runs.push(run);
        run = [];
      } else run.push({ i, value: p.value });
    });
    if (run.length) runs.push(run);
    return runs;
  };

  const onMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!plotW || dates.length === 0) return;
      const box = event.currentTarget.getBoundingClientRect();
      const local = event.clientX - box.left - PAD.left;
      const index = Math.round(local / (step || plotW || 1));
      setActive(Math.max(0, Math.min(dates.length - 1, index)));
    },
    [dates.length, plotW, step],
  );

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

  return (
    <figure className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <figcaption className="text-sm font-medium">
          {title} <span className="text-ink-muted">({unit})</span>
        </figcaption>
        {multi && (
          <ul className="flex gap-3">
            {series.map((s) => (
              <li key={s.name} className="flex items-center gap-1.5 text-xs text-ink-muted">
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: s.color }}
                  aria-hidden
                />
                {s.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div ref={holder} className="relative" style={{ height }}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`${title}, ${known.length} observations. Values available in the table below.`}
            className="touch-pan-y overflow-visible select-none"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setActive(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--color-line)"
                  strokeWidth="1"
                />
                <text
                  x={PAD.left - 6}
                  y={y(t) + 3.5}
                  textAnchor="end"
                  fontSize="10"
                  fill="var(--color-ink-subtle)"
                  className="tabular-nums"
                >
                  {format(t)}
                </text>
              </g>
            ))}

            {series.map((s) =>
              kind === "bar" ? (
                <g key={s.name}>
                  {s.points.map((p, i) =>
                    p.value === null ? null : (
                      <rect
                        key={`${s.name}:${i}`}
                        x={x(i) - Math.max(2, Math.min(14, step * 0.32))}
                        y={y(p.value)}
                        width={Math.max(4, Math.min(28, step * 0.64))}
                        height={Math.max(0, y(yMin) - y(p.value))}
                        rx="3"
                        fill={s.color}
                        opacity={active === null || active === i ? 1 : 0.55}
                      />
                    ),
                  )}
                </g>
              ) : (
                <g key={s.name}>
                  {segments(s.points).map((run, r) => (
                    <path
                      key={`${s.name}:${r}`}
                      d={run.map((p, k) => `${k ? "L" : "M"}${x(p.i)},${y(p.value)}`).join(" ")}
                      fill="none"
                      stroke={s.color}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                  {s.points.map((p, i) =>
                    p.value === null ? null : (
                      <circle
                        key={`${s.name}:${i}`}
                        cx={x(i)}
                        cy={y(p.value)}
                        r={active === i ? 4.5 : 2.5}
                        fill={s.color}
                        stroke="var(--color-surface)"
                        strokeWidth="2"
                      />
                    ),
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

            {[0, dates.length - 1].map((i, k) =>
              dates[i] ? (
                <text
                  key={`${i}:${k}`}
                  x={k === 0 ? PAD.left : width - PAD.right}
                  y={height - 6}
                  textAnchor={k === 0 ? "start" : "end"}
                  fontSize="10"
                  fill="var(--color-ink-subtle)"
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
            className="pointer-events-none absolute top-0 rounded-control border border-line-strong bg-canvas px-2 py-1 text-xs"
            style={{
              left: Math.max(0, Math.min(width - 132, x(active) - 66)),
              minWidth: 108,
            }}
          >
            <p className="text-ink-subtle">{formatIsoDate(dates[active]!)}</p>
            {series.map((s) => (
              <p key={s.name} className="flex items-center gap-1.5 tabular-nums">
                {multi && (
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: s.color }}
                    aria-hidden
                  />
                )}
                <span className="font-medium">
                  {s.points[active]?.value === null || s.points[active] === undefined
                    ? "—"
                    : format(s.points[active]!.value!)}
                </span>
                <span className="text-ink-subtle">{multi ? s.name : unit}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      {note && <p className="text-xs text-ink-subtle">{note}</p>}

      <details className="text-xs text-ink-muted">
        <summary className="flex min-h-11 cursor-pointer items-center select-none">
          View values
        </summary>
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-left tabular-nums">
            <thead className="sticky top-0 bg-surface">
              <tr>
                <th className="py-1 font-medium">Date</th>
                {series.map((s) => (
                  <th key={s.name} className="py-1 text-right font-medium">
                    {multi ? s.name : unit}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.map((date, i) => (
                <tr key={`${date}:${i}`} className={cn(active === i && "text-ink")}>
                  <td className="py-1">{date}</td>
                  {series.map((s) => (
                    <td key={s.name} className="py-1 text-right">
                      {s.points[i]?.value === null || s.points[i] === undefined
                        ? "—"
                        : format(s.points[i]!.value!)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
