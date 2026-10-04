import type { Route } from "next";
import { useId, type CSSProperties } from "react";

import Link from "@/components/ui/app-link";
import { formatIsoWeekdayDay } from "@/lib/format";
import { cn } from "@/lib/utils";

import { DayPrint, Grain } from "./day-print";
import {
  bowlPrint,
  calendarIcon,
  dayIcons,
  form,
  ICON,
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
      /** A sport's icon on the calendar, and beside a count, the month's key to it. */
      kind: "icon";
      sport: Sport;
      size?: number;
      className?: string;
    }
  | {
      /** A month: the weekdays across the top, a tile of paper for each day, an icon each. */
      kind: "month";
      /** "2026-09". */
      month: string;
      days: Readonly<Record<number, readonly CalendarEntry[]>>;
      /**
       * Today's day of this month, ringed. The month ends at its week: the days after it in
       * that week are outlines and are not links, and the weeks still to come get no rows.
       */
      today?: number | null;
      /** The calendar page's dates, small, in each tile's corner. */
      dates?: boolean;
      /** Each tile's height: a day is a link, so never under a target. */
      cellHeight?: number;
      /** Where each past day opens, when it can. */
      links?: Readonly<Record<number, Route>>;
      label?: string;
      className?: string;
    };

/**
 * The art: every print Form v2 draws, from the account's records and nothing else.
 *
 * One component for the grammar's uses: a day's print (Today, a programme day, a workout, a
 * record), a sport's mark beside a name, Food's bowl, and the calendar's month and its icons.
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
    case "icon":
      return <Icon {...props} />;
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

function Icon({ sport, size = ICON.size, className }: Extract<ArtProps, { kind: "icon" }>) {
  const id = svgId(useId());
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={cn("block shrink-0 overflow-visible", className)}
    >
      <Shapes shapes={calendarIcon(sport, 0, 0, 24)} surface="ground" id={id} />
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
/** A day's icons stand in a square this wide: four of them, in two rows of two. */
const ICON_BOX = 2 * ICON.size + ICON.gap;

/**
 * The month: each day a tile of paper, its date in the corner on the calendar page and an icon
 * for each activity in the middle, so a month reads as a pattern before it is read as dates. A
 * day with nothing in it is a paler sheet; today is ringed in ink, and the rest of its week
 * are outlines, not links; every past day is named with what it holds. Every tile is the same
 * size, so no week grows with what it holds and no icon shrinks.
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
  const all = monthCells(year, monthNumber - 1);
  // This month ends at today's week: the weeks still to come get no empty rows.
  const weeks = today === null ? Infinity : Math.floor((all.indexOf(1) + today - 1) / 7) + 1;
  const cells = all.slice(0, weeks * 7);
  return (
    <div
      role="group"
      aria-label={label ?? `${MONTH_NAMES[monthNumber - 1]} ${year}`}
      className={cn("month", dates && "month-dated", className)}
      style={{ "--month-day": `${cellHeight}px` } as CSSProperties}
    >
      <div aria-hidden className="month-weekdays">
        {WEEKDAYS.map((letter, i) => (
          <span key={i}>{letter}</span>
        ))}
      </div>
      <div className="month-days">
        {cells.map((day, i) => {
          if (day === null) return <span key={i} aria-hidden />;
          const entries = days[day] ?? [];
          const isToday = day === today;
          const date = dates && (
            <span aria-hidden className="month-date">
              {day}
            </span>
          );
          if (today !== null && day > today)
            return (
              <span key={i} aria-hidden className="month-day month-day-future">
                {date}
              </span>
            );
          const iso = `${month}-${String(day).padStart(2, "0")}`;
          const said = entries.length ? entries.map((e) => e.said).join(", ") : "nothing logged";
          const name = `${formatIsoWeekdayDay(iso)}${isToday ? ", today" : ""}: ${said}`;
          const tile = cn(
            "month-day",
            entries.length === 0 && "month-day-rest",
            isToday && "month-day-today",
          );
          const inner = (
            <>
              {date}
              {entries.length > 0 && (
                <span aria-hidden className="month-icons">
                  <svg
                    width={ICON_BOX}
                    height={ICON_BOX}
                    viewBox={`0 0 ${ICON_BOX} ${ICON_BOX}`}
                    className="block overflow-visible"
                  >
                    <Shapes
                      shapes={dayIcons(
                        entries.map((e) => e.sport),
                        ICON_BOX / 2,
                        ICON_BOX / 2,
                      )}
                      surface="paper"
                      id={`${id}-${day}`}
                    />
                  </svg>
                </span>
              )}
            </>
          );
          const href = links[day];
          return href ? (
            <Link key={i} href={href} aria-label={name} className={tile}>
              {inner}
            </Link>
          ) : (
            <span key={i} role="img" aria-label={name} className={tile}>
              {inner}
            </span>
          );
        })}
      </div>
    </div>
  );
}
