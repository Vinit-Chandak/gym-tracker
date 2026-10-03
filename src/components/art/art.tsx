import type { Route } from "next";
import { useId } from "react";

import Link from "@/components/ui/app-link";
import { formatIsoWeekdayDay } from "@/lib/format";
import { cn } from "@/lib/utils";

import { DayPrint, Grain } from "./day-print";
import {
  bowlPrint,
  dayMarks,
  form,
  monthCells,
  type BowlMeal,
  type FormState,
  type PrintPart,
  type Sport,
} from "./geometry";
import { Shapes, svgId, type Surface } from "./shapes";

/** One activity on a day of the calendar, and how a screen reader names it ("run 5 km"). */
export type CalendarEntry = { sport: Sport; said: string };

export type ArtProps =
  | {
      /** A day's print: its parts on one module grid, centred on the paper. */
      kind: "print";
      parts: readonly PrintPart[];
      label?: string;
      /** Sizes the paper; the print is laid out on whatever box this gives it. */
      className?: string;
      maxModule?: number;
      /** A module shared by a page of prints, so they compare at a glance. */
      module?: number;
      fallback?: { width: number; height: number };
      /** Hears the largest module the print fits at, for a page of prints to share the least. */
      onModule?: (module: number) => void;
    }
  | {
      /** A sport's form, in its state, beside a name: a list's mark, a legend's key. */
      kind: "mark";
      sport: Sport;
      size?: number;
      state?: FormState;
      segments?: number;
      done?: number;
      /** Named when the mark says something the words beside it do not. */
      label?: string;
      surface?: Surface;
      className?: string;
    }
  | {
      /** Food's print: the day's target as a bowl, filled meal by meal, heaped when over. */
      kind: "bowl";
      meals: readonly BowlMeal[];
      target: number;
      label?: string;
      className?: string;
      maxRadius?: number;
      /** A small print (a portion's sheet): less paper round the bowl, a finer rim. */
      pad?: number;
      rimWidth?: number;
    }
  | {
      /** A month on paper: the weekdays across the top, a dot for an empty day, a mark each. */
      kind: "month";
      /** "2026-09". */
      month: string;
      days: Readonly<Record<number, readonly CalendarEntry[]>>;
      /** Today's day of this month, ringed; the days after it are blank and are not links. */
      today?: number | null;
      /** The calendar page's dates, small, in each cell's corner. */
      dates?: boolean;
      cellHeight?: number;
      /** Where each past day opens, when it can. */
      links?: Readonly<Record<number, Route>>;
      label?: string;
      className?: string;
    };

/**
 * The art: every print Form v2 draws, from the account's records and nothing else.
 *
 * One component for the grammar's four uses: a day's print (Today, a programme day, a
 * workout, a record), a sport's mark beside a name, Food's bowl and the calendar's month.
 * The geometry is in `geometry.ts`; this draws it with the palette's tokens, so the same
 * print is pulled on light or dark paper by CSS alone.
 */
export function Art(props: ArtProps) {
  switch (props.kind) {
    case "print":
      return (
        <DayPrint
          parts={props.parts}
          label={props.label}
          className={props.className}
          maxModule={props.maxModule}
          module={props.module}
          fallback={props.fallback}
          onModule={props.onModule}
        />
      );
    case "mark":
      return <Mark {...props} />;
    case "bowl":
      return <Bowl {...props} />;
    case "month":
      return <Month {...props} />;
  }
}

function Mark({
  sport,
  size = 18,
  state = "done",
  segments = 0,
  done = 0,
  label,
  surface = "ground",
  className,
}: Extract<ArtProps, { kind: "mark" }>) {
  const id = svgId(useId());
  const pad = 1;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`${-pad} ${-pad} ${size + 2 * pad} ${size + 2 * pad}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("block shrink-0 overflow-visible", className)}
    >
      <Shapes
        shapes={form(sport, 0, 0, size, size, { state, segments, done })}
        surface={surface}
        id={id}
      />
    </svg>
  );
}

/** The bowl stands centred on its paper, as large as it can be, with air above the rim. */
function Bowl({
  meals,
  target,
  label,
  className,
  maxRadius = 100,
  pad = 18,
  rimWidth = 3,
}: Extract<ArtProps, { kind: "bowl" }>) {
  const id = svgId(useId());
  // The bowl's radius is capped well inside a phone's width, so the bowl is laid out on the
  // narrowest box that gives it its full size and centred on paper of any width: nothing here
  // needs the paper measured.
  const width = 2 * (maxRadius + pad + rimWidth * 3);
  const { height, figure } = bowlPrint({ width, meals, target, maxRadius, pad, rimWidth });
  return (
    <div
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("relative isolate flex justify-center overflow-hidden bg-paper", className)}
    >
      <svg
        aria-hidden
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="relative block shrink-0"
      >
        <clipPath id={`${id}-bowl`}>
          <path d={figure.bowlClip} />
        </clipPath>
        <g clipPath={`url(#${id}-bowl)`}>
          <Shapes shapes={figure.inside} surface="paper" id={`${id}-i`} />
        </g>
        {figure.heapClip && (
          <>
            <clipPath id={`${id}-heap`}>
              <path d={figure.heapClip} />
            </clipPath>
            <g clipPath={`url(#${id}-heap)`}>
              <Shapes shapes={figure.heap} surface="paper" id={`${id}-h`} />
            </g>
          </>
        )}
        <Shapes shapes={figure.outline} surface="paper" id={`${id}-o`} />
      </svg>
      <Grain />
    </div>
  );
}

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"] as const;
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
/** Each day's marks are drawn in a box this wide, centred in its cell. */
const MARK_BOX = 48;

/**
 * The month, in the first calendar's style: pulled on paper like a print, the weekdays across
 * the top, a dot for a day with nothing in it, each activity its sport's mark, so a month reads
 * as a pattern before it is read as dates. Today is ringed; days to come are blank and are not
 * links; every past day is named with what it holds.
 */
function Month({
  month,
  days,
  today = null,
  dates = false,
  cellHeight = 50,
  links = {},
  label,
  className,
}: Extract<ArtProps, { kind: "month" }>) {
  const id = svgId(useId());
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const cells = monthCells(year, monthNumber - 1);
  const top = dates ? 12 : 0;
  const markHeight = cellHeight - top;
  return (
    <div
      role="group"
      aria-label={label ?? `${MONTH_NAMES[monthNumber - 1]} ${year}`}
      className={cn("bg-paper px-1.5 pt-1.5 pb-2", className)}
    >
      <div aria-hidden className="grid h-6 grid-cols-7 items-center">
        {WEEKDAYS.map((letter, i) => (
          <span key={i} className="text-center type-print-label text-print-label">
            {letter}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (day === null) return <span key={i} aria-hidden />;
          const entries = days[day] ?? [];
          const future = today !== null && day > today;
          const isToday = day === today;
          const box = "relative flex min-w-0 items-center justify-center";
          const style = { height: cellHeight, paddingTop: top };
          const date = dates && (
            <span
              aria-hidden
              className={cn(
                "absolute top-[7px] left-2 figures text-[0.8125rem] leading-none",
                isToday ? "font-bold text-print-ink" : "font-medium text-print-label",
              )}
            >
              {day}
            </span>
          );
          if (future)
            return (
              <span key={i} aria-hidden className={box} style={style}>
                {date}
              </span>
            );
          const iso = `${month}-${String(day).padStart(2, "0")}`;
          const said = entries.length ? entries.map((e) => e.said).join(", ") : "nothing logged";
          const name = `${formatIsoWeekdayDay(iso)}${isToday ? ", today" : ""}: ${said}`;
          const inner = (
            <>
              {isToday && (
                <span
                  aria-hidden
                  className="absolute inset-[3px] rounded-row border-[1.5px] border-print-ink"
                />
              )}
              {date}
              <svg
                aria-hidden
                // A day's marks stay in their cell: on the narrowest phones the box shrinks
                // with the cell, and the marks with it.
                width="100%"
                height={markHeight}
                viewBox={`0 0 ${MARK_BOX} ${markHeight}`}
                className="block max-w-12 overflow-visible"
              >
                {entries.length ? (
                  <Shapes
                    shapes={dayMarks(
                      entries.map((e) => e.sport),
                      MARK_BOX,
                      markHeight,
                    )}
                    surface="paper"
                    id={`${id}-${day}`}
                  />
                ) : (
                  <circle
                    cx={MARK_BOX / 2}
                    cy={markHeight / 2}
                    r={2}
                    style={{ fill: "var(--ov-print-dot)" }}
                  />
                )}
              </svg>
            </>
          );
          const href = links[day];
          return href ? (
            <Link key={i} href={href} aria-label={name} className={box} style={style}>
              {inner}
            </Link>
          ) : (
            <span key={i} role="img" aria-label={name} className={box} style={style}>
              {inner}
            </span>
          );
        })}
      </div>
    </div>
  );
}
