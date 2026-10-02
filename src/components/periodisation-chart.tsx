"use client";

import { useEffect, useId, useRef, useState } from "react";

import { niceTicks } from "@/components/ui/chart";
import { addDays, daysBetween } from "@/domain/program-calendar";
import { formatIsoDay } from "@/lib/format";

/** One calendar week of the programme's span, Monday first. */
export type WorkWeek = {
  /** The Monday, as an ISO date in the account's time zone. */
  date: string;
  /** Working sets from finished workouts that week, warm-ups excluded. */
  sets: number;
};

export type PeriodisationData = {
  /** The programme's name, for the chart's own description. */
  name: string;
  /** The first day of the programme, an ISO date. */
  startDate: string;
  /** The last day of the programme, an ISO date. */
  endDate: string;
  /** How many cycles the programme runs, and how many days each cycle holds. */
  cycles: number;
  daysPerCycle: number;
  /** The cycle the sequence is on: the cell the highlighter marks. */
  currentCycle: number;
  /** What one cycle of the programme prescribes, in working sets. */
  setsPerCycle: number;
  /** Every week from the programme's first to its last, in order, with its work. */
  weeks: readonly WorkWeek[];
  /** Today, an ISO date in the account's time zone. */
  today: string;
  /** Programme days done and the programme's length, for the line under the chart. */
  progress: { completed: number; total: number };
};

const PAD = { top: 14, right: 10, bottom: 26, left: 36 };

/**
 * The programme as a periodisation chart, the sheet's signature graphic: the cycles as blocks
 * banded across the span, the work actually done each week as stepped bars inked over them,
 * and what the programme asks of a cycle as a step of pencil the ink is read against. The
 * cycle the sequence is on sits under the highlighter and today is a pen line, so the two ways
 * of being "behind" are both visible: the plan's position and the calendar's.
 *
 * Nothing moves. The chart is read, not watched.
 */
export function PeriodisationChart({ data }: { data: PeriodisationData }) {
  const holder = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const patternId = useId();
  const height = 190;

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { weeks, cycles, daysPerCycle, currentCycle, setsPerCycle, startDate, endDate, today } =
    data;
  const first = weeks[0]?.date ?? startDate;
  // The plot spans whole weeks, so the bands and the bars share one date axis.
  const last = weeks.length ? addDays(weeks[weeks.length - 1]!.date, 7) : addDays(endDate, 1);
  const spanDays = Math.max(1, daysBetween(first, last));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const xAt = (iso: string) =>
    PAD.left + (Math.min(Math.max(daysBetween(first, iso), 0), spanDays) / spanDays) * plotW;

  // The plan's step is planned work per week: a cycle's sets, spread over the days it takes.
  const plannedPerWeek = daysPerCycle > 0 ? (setsPerCycle * 7) / daysPerCycle : setsPerCycle;
  const most = Math.max(plannedPerWeek, ...weeks.map((week) => week.sets), 1);
  const ticks = niceTicks(0, most, 4, true);
  const yMax = ticks[ticks.length - 1]!;
  const y = (value: number) => PAD.top + plotH - (value / (yMax || 1)) * plotH;

  const thisWeek = weeks.find((week) => today >= week.date && today < addDays(week.date, 7));
  const inkedSets = weeks.reduce((sum, week) => sum + week.sets, 0);
  const description = `${data.name}: ${cycles} cycles of ${daysPerCycle} days, ${setsPerCycle} working sets a cycle. Now on cycle ${currentCycle}. ${inkedSets} working sets logged since ${formatIsoDay(startDate)}.`;

  return (
    <figure className="min-w-0">
      <div ref={holder} className="relative" style={{ height }}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={description}
            className="overflow-visible select-none"
          >
            <defs>
              {/* The week still running is hatched: its total is not a whole week's yet. */}
              <pattern
                id={patternId}
                patternUnits="userSpaceOnUse"
                width="6"
                height="6"
                patternTransform="rotate(45)"
              >
                <rect width="6" height="6" fill="var(--color-canvas)" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-ink)" strokeWidth="3" />
              </pattern>
            </defs>

            {/* The cycle blocks, banded across the span; the sequence's cycle under the highlighter. */}
            {Array.from({ length: cycles }, (_, index) => {
              const cycle = index + 1;
              const from = addDays(startDate, index * daysPerCycle);
              const to = addDays(from, daysPerCycle);
              const x1 = xAt(from);
              const x2 = xAt(to);
              const current = cycle === currentCycle;
              return (
                <g key={cycle}>
                  <rect
                    x={x1}
                    y={PAD.top}
                    width={Math.max(0, x2 - x1)}
                    height={plotH}
                    fill={
                      current
                        ? "var(--color-highlight-soft)"
                        : index % 2 === 0
                          ? "var(--color-surface-raised)"
                          : "transparent"
                    }
                  />
                  {/* The cycle's number along the foot, the current one on its own highlighter cell. */}
                  {x2 - x1 >= 14 && (
                    <>
                      {current && (
                        <rect
                          x={(x1 + x2) / 2 - 9}
                          y={height - PAD.bottom + 6}
                          width="18"
                          height="16"
                          rx="2"
                          fill="var(--color-highlight)"
                        />
                      )}
                      <text
                        x={(x1 + x2) / 2}
                        y={height - PAD.bottom + 18}
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="600"
                        fill={current ? "var(--color-on-highlight)" : "var(--color-ink-subtle)"}
                        className="font-data tabular-nums"
                      >
                        {cycle}
                      </text>
                    </>
                  )}
                </g>
              );
            })}

            {/* The grid: a dotted hairline at every tick, the baseline and the axis solid. */}
            {ticks.map((tick, k) => (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke="var(--color-line)"
                  strokeWidth="1"
                  strokeDasharray={k === 0 ? undefined : "1 3"}
                />
                <text
                  x={PAD.left - 6}
                  y={y(tick) + 3.5}
                  textAnchor="end"
                  fontSize="11"
                  fill="var(--color-ink-subtle)"
                  className="font-data tabular-nums"
                >
                  {tick}
                </text>
              </g>
            ))}
            <line
              x1={PAD.left}
              x2={PAD.left}
              y1={y(yMax)}
              y2={y(0)}
              stroke="var(--color-line)"
              strokeWidth="1"
            />

            {/* The work: one stepped bar per week, inked in; the running week hatched. */}
            {weeks.map((week) => {
              if (week.sets <= 0) return null;
              const x1 = xAt(week.date) + 1;
              const x2 = xAt(addDays(week.date, 7)) - 1;
              const running = week === thisWeek;
              return (
                <rect
                  key={week.date}
                  x={x1}
                  y={y(week.sets)}
                  width={Math.max(1, x2 - x1)}
                  height={Math.max(0, y(0) - y(week.sets))}
                  fill={running ? `url(#${patternId})` : "var(--color-ink)"}
                  stroke={running ? "var(--color-ink)" : undefined}
                  strokeWidth={running ? 1 : undefined}
                />
              );
            })}

            {/* The plan, in pencil: what a week of the programme asks, stepping in at its
                first day and out at its last. */}
            {plannedPerWeek > 0 && (
              <polyline
                points={[
                  `${xAt(startDate)},${y(0)}`,
                  `${xAt(startDate)},${y(plannedPerWeek)}`,
                  `${xAt(addDays(endDate, 1))},${y(plannedPerWeek)}`,
                  `${xAt(addDays(endDate, 1))},${y(0)}`,
                ].join(" ")}
                fill="none"
                stroke="var(--color-ink-ghost)"
                strokeWidth="1.5"
                strokeDasharray="2 3"
                strokeLinejoin="miter"
              />
            )}

            {/* Today, as a pen line down the sheet. */}
            {today >= first && today < last && (
              <line
                x1={xAt(today)}
                x2={xAt(today)}
                y1={PAD.top - 6}
                y2={y(0)}
                stroke="var(--color-pen)"
                strokeWidth="1.5"
              />
            )}
          </svg>
        )}
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 bg-ink" aria-hidden />
          Working sets a week
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-4 border-t-2 border-dashed border-ink-ghost" aria-hidden />
          The plan, {Math.round(plannedPerWeek)} a week
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-pen" aria-hidden />
          Today
        </span>
      </figcaption>
      {/* Every value drawn, for a reader who cannot see the plot. */}
      <table className="sr-only">
        <caption>Working sets by week</caption>
        <thead>
          <tr>
            <th scope="col">Week of</th>
            <th scope="col">Working sets</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week.date}>
              <th scope="row">{formatIsoDay(week.date)}</th>
              <td>{week.sets}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
