"use client";

import { useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { Glyph } from "./glyphs";
import { barRects, barScale, lineScale, linePoints, type InkPoint } from "./ink-chart-geometry";
import { useMeasure } from "./use-width";

export type { InkPoint } from "./ink-chart-geometry";

/** The scale's labels: 12 pt at 100% text, growing with it, in Atkinson 600, ink 2. */
const LABEL = {
  fontSize: "var(--ov-type-print-label)",
  fontWeight: 600,
  fill: "var(--ov-ink-2)",
} as const;

/** The margin column the scale's labels stand in, wide enough for the widest of them. */
function marginFor(labels: readonly string[], root: number, least = 26): number {
  const px = 0.75 * root;
  const widest = Math.max(0, ...labels.map((text) => text.length));
  return Math.max(least, Math.ceil(widest * 0.62 * px) + 10);
}

/**
 * Progress's bars (boards Running, Recovery, Exercise): a bar for each week, month or reading,
 * in `control`, the latest in ink; the scale's round values as hairlines with their labels in
 * the left margin; a rule in ink where one matters (sleep's 6 h).
 */
export function InkBars({
  points,
  label,
  format = (value) => String(value),
  height = 132,
  integral = false,
  scaleMax,
  rule,
  ends,
  months = false,
  className,
}: {
  points: readonly InkPoint[];
  /** What the chart says aloud: what it counts, over what, the latest. */
  label: string;
  format?: (value: number) => string;
  height?: number;
  /** Counts: the scale says whole numbers only. */
  integral?: boolean;
  /** A fixed top with no scale of its own (sleep: 8 h, drawn against its rule). */
  scaleMax?: number;
  rule?: { value: number; label: string };
  /** The first and the last slot's names, under the chart. */
  ends?: readonly [string, string];
  /** Each month named under its first reading, inside the chart (Recovery). */
  months?: boolean;
  className?: string;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const { width, root } = useMeasure(holder, undefined, { width: 362, height, root: 16 });
  const values = points.flatMap((point) => (point.value === null ? [] : [point.value]));
  const scale =
    scaleMax !== undefined
      ? { ticks: [] as number[], max: Math.max(scaleMax, ...values) }
      : barScale(values, { integral });
  const labels = [...scale.ticks.map(format), ...(rule ? [rule.label] : [])];
  const left = marginFor(labels, root, rule ? 34 : 26);
  const top = 10;
  const bottom = height - (months ? 22 : 2);
  const y = (value: number) => bottom - (value / scale.max) * (bottom - top);
  const bars = barRects(points, { left, width, top, bottom, max: scale.max });

  return (
    <div className={cn("min-w-0", className)}>
      <div ref={holder} className="w-full" style={{ height }}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={label}
          className="block overflow-visible"
        >
          {scale.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={left - 4}
                x2={width}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--ov-hair)"
                strokeWidth={1}
              />
              <text x={0} y={y(tick) + 4} style={LABEL}>
                {format(tick)}
              </text>
            </g>
          ))}
          {!rule && (
            <line
              x1={left - 4}
              x2={width}
              y1={bottom}
              y2={bottom}
              stroke="var(--ov-hair)"
              strokeWidth={1}
            />
          )}
          {bars.map((bar) => (
            <rect
              key={bar.index}
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              rx={bar.radius}
              style={{ fill: bar.ink ? "var(--ov-ink)" : "var(--ov-control)" }}
            />
          ))}
          {months &&
            points.map((point, index) => {
              const month = point.date.slice(0, 7);
              if (index > 0 && points[index - 1]!.date.slice(0, 7) === month) return null;
              const slot = (width - left) / points.length;
              return (
                <text key={point.date} x={left + index * slot} y={height - 6} style={LABEL}>
                  {MONTH_NAMES[Number(point.date.slice(5, 7)) - 1]}
                </text>
              );
            })}
          {rule && (
            <g>
              <line
                x1={left - 4}
                x2={width}
                y1={y(rule.value)}
                y2={y(rule.value)}
                stroke="var(--ov-ink)"
                strokeWidth={1}
              />
              <text
                x={0}
                y={y(rule.value) + 4}
                style={{ ...LABEL, fontWeight: 700, fill: "var(--ov-ink)" }}
              >
                {rule.label}
              </text>
            </g>
          )}
        </svg>
      </div>
      {ends && (
        <p
          aria-hidden
          className="mt-1 flex justify-between gap-3 text-[length:var(--ov-type-print-label)] font-semibold text-ink-2 tabular-nums"
          style={{ paddingLeft: left }}
        >
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </p>
      )}
    </div>
  );
}

/** The months as the app writes them on a date (en-GB short: "Jul", "Sept"). */
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * Progress's line (board Body): the readings joined in ink, each an open point, the latest a
 * full one; the round values inside the readings as hairlines, their labels in the margin; the
 * first and last dates under it.
 */
export function InkLine({
  points,
  label,
  format = (value) => String(value),
  height = 170,
  ends,
  className,
}: {
  points: readonly InkPoint[];
  label: string;
  format?: (value: number) => string;
  height?: number;
  /** The first and the last reading's dates, under the line's ends. */
  ends?: readonly [string, string];
  className?: string;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const { width, root } = useMeasure(holder, undefined, { width: 362, height, root: 16 });
  const values = points.flatMap((point) => (point.value === null ? [] : [point.value]));
  const { ticks, lo, hi } = lineScale(values);
  const left = marginFor(ticks.map(format), root);
  const right = width - 14;
  const top = 18;
  const bottom = height - 26;
  const placed = linePoints(points, { left, right, top, bottom, lo, hi });
  const y = (value: number) => bottom - ((value - lo) / (hi - lo || 1)) * (bottom - top);
  const last = placed.at(-1);

  return (
    <div ref={holder} className={cn("w-full min-w-0", className)} style={{ height }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label}
        className="block overflow-visible"
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={left}
              x2={right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--ov-hair)"
              strokeWidth={1}
            />
            <text x={0} y={y(tick) + 4} style={LABEL}>
              {format(tick)}
            </text>
          </g>
        ))}
        {placed.length > 1 && (
          <path
            d={placed.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("")}
            fill="none"
            stroke="var(--ov-ink)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {placed.slice(0, -1).map((p) => (
          <circle
            key={p.index}
            cx={p.x}
            cy={p.y}
            r={2.6}
            style={{ fill: "var(--ov-ground)", stroke: "var(--ov-ink)" }}
            strokeWidth={1.6}
          />
        ))}
        {last && <circle cx={last.x} cy={last.y} r={5.5} style={{ fill: "var(--ov-ink)" }} />}
        {ends && placed.length > 0 && (
          <>
            <text x={left} y={height - 6} style={LABEL}>
              {ends[0]}
            </text>
            {/* One reading has one date. */}
            {placed.length > 1 && (
              <text x={last!.x} y={height - 6} textAnchor="end" style={LABEL}>
                {ends[1]}
              </text>
            )}
          </>
        )}
      </svg>
    </div>
  );
}

/**
 * Every reading a chart draws, as a list behind one row (board Body: View values): the chart
 * is for the shape, this for the numbers, and it is how a screen reader reads them.
 */
export function ChartValues({
  rows,
  label = "View values",
}: {
  /** Newest first. */
  rows: readonly { key: string; date: string; value: string }[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (rows.length === 0) return null;
  return (
    <div className="chart-values">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((current) => !current)}
        className="chart-values-button"
      >
        <span className="mark-cell">
          <Glyph name="table" className="glyph-20" />
        </span>
        <span className="min-w-0 flex-1 text-left font-bold">{label}</span>
        <span className="type-meta-small font-semibold text-ink-2 tabular-nums">{rows.length}</span>
        <Glyph name={open ? "chevronUp" : "chevronDown"} className="glyph-18" />
      </button>
      {open && (
        <ul id={id} className="chart-values-list">
          {rows.map((row) => (
            <li key={row.key}>
              <span className="text-ink-2">{row.date}</span>
              <span className="font-semibold tabular-nums">{row.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
