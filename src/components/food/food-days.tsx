"use client";

import type { Route } from "next";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import Link from "@/components/ui/app-link";
import { buttonClassName } from "@/components/ui/button";
import { Glyph } from "@/components/ui/glyphs";
import { Sheet } from "@/components/ui/sheet";
import { useMeasure } from "@/components/ui/use-width";
import {
  addMonths,
  foodDayMark,
  monthGrid,
  monthOf,
  stripWeeks,
  type FoodDayMark,
  type FoodDayTotal,
} from "@/domain/food-days";
import {
  formatDateRange,
  formatIsoLongDay,
  formatIsoMonth,
  formatIsoWeekdayLetter,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { readFoodMonthAction } from "@/server/actions/nutrition";

/** What the strip and the calendar are drawn from (ADR 0037). */
type FoodDaysProps = {
  today: string;
  /** The day on screen. */
  date: string;
  /** Each day with food on it, from `from` to today. */
  days: readonly FoodDayTotal[];
  /** The target the marks are read against, or null when there is none. */
  targetKcal: number | null;
  /** The Food screen a day opens on: the app's, or the preview's. */
  base: Route;
};

/** What a mark says to someone who cannot see it. */
const MARK_WORDS: Record<FoodDayMark, string> = {
  logged: "food logged",
  met: "goal met",
  over: "over the goal",
};

/** The same day's page for today is the Food screen itself; any other carries its date. */
function dayHref(base: Route, day: string, today: string): Route {
  return day === today ? base : (`${base}?day=${day}` as Route);
}

function markDays(days: readonly FoodDayTotal[], targetKcal: number | null) {
  return new Map(days.map((day) => [day.date, foodDayMark(day.kcal, targetKcal)]));
}

/** The bowl's outline: a half disc, 19 across, under its rim. */
const BOWL = "M1.5 6h19a9.5 9.5 0 0 1 -19 0z";
/** Its lower half, by height: food logged under the band. */
const HALF = "M2.77 10.75H19.23A9.5 9.5 0 0 1 2.77 10.75Z";
/** The heap over the rim, past the band. */
const HEAP = "M1.5 6A10.64 10.64 0 0 1 20.5 6Z";

/**
 * A day's mark (board Food): its bowl, in the day's ink. Empty with nothing logged, half full
 * under the goal band, full once it is met, heaped past it.
 */
function DayBowl({ mark }: { mark: FoodDayMark | undefined }) {
  return (
    <svg viewBox="0 0 22 17.5" aria-hidden className="food-day-mark">
      {mark === "logged" && <path d={HALF} fill="currentColor" />}
      {(mark === "met" || mark === "over") && <path d={BOWL} fill="currentColor" />}
      {mark === "over" && <path d={HEAP} fill="currentColor" />}
      <path d={BOWL} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" />
    </svg>
  );
}

/**
 * One day: its weekday's letter where the strip has no row of them, its date, and its bowl. The
 * day on screen is in ink; today, when another day is on screen, is ringed. A day still to come
 * is shown but cannot be opened.
 */
function DayLink({
  day,
  today,
  selected,
  mark,
  base,
  letter = false,
  onPick,
}: {
  day: string;
  today: string;
  selected: string;
  mark: FoodDayMark | undefined;
  base: Route;
  letter?: boolean;
  onPick?: () => void;
}) {
  const number = Number(day.slice(8));
  const weekday = letter && (
    <span aria-hidden className="food-day-letter">
      {formatIsoWeekdayLetter(day)}
    </span>
  );
  if (day > today) {
    return (
      <span className="food-day food-day-later">
        {weekday}
        <span aria-hidden className="type-figure">
          {number}
        </span>
        <span aria-hidden className="food-day-mark" />
      </span>
    );
  }
  const isToday = day === today;
  const label = [formatIsoLongDay(day), isToday ? "today" : null, mark ? MARK_WORDS[mark] : null]
    .filter(Boolean)
    .join(", ");
  return (
    <Link
      href={dayHref(base, day, today)}
      prefetch="intent"
      aria-label={label}
      aria-current={day === selected ? "page" : undefined}
      onClick={onPick}
      className={cn("food-day", day === selected ? "food-day-on" : isToday && "food-day-today")}
    >
      {weekday}
      <span aria-hidden className="type-figure">
        {number}
      </span>
      <DayBowl mark={mark} />
    </Link>
  );
}

/** A day's width where seven no longer fit: 44 pt at 100% text, growing with it. */
const DAY_REM = 2.75;
/** The strip folds to a scroll under seven days and their gaps: 7 × 2.75 rem + 1.5 rem. */
const FOLD_REM = 20.75;
/** The gap between days in the scroll. */
const SCROLL_GAP = 3;

/**
 * The days under the Food header (ADR 0037; board Food): weeks of seven ending on today, so
 * yesterday is always one tap away, with earlier weeks a swipe away to the left. While seven
 * days fit, a week fills the width and the strip turns a week at a time; narrower (board
 * Food-320), the days scroll, resting on the latest whole days from the gutter, the one before
 * them waiting behind a fade in the gutter, never cut through.
 */
export function FoodWeekStrip({ today, date, days, targetKcal, base }: FoodDaysProps) {
  const weeks = stripWeeks(today, date);
  const marks = markDays(days, targetKcal);
  const nav = useRef<HTMLElement>(null);
  const shownWeek = useRef<HTMLOListElement>(null);
  const shownDay = useRef<HTMLLIElement>(null);
  const { width, root } = useMeasure(nav, undefined, { width: 362, height: 0, root: 16 });
  const scrolls = width < FOLD_REM * root;
  // As many whole days as the width holds, widened to fill it, so today ends at the gutter.
  const least = DAY_REM * root;
  const whole = Math.max(1, Math.floor((width + SCROLL_GAP) / (least + SCROLL_GAP)));
  const dayWidth = Math.max(least, (width - (whole - 1) * SCROLL_GAP) / whole);

  useEffect(() => {
    const shown = scrolls ? shownDay.current : shownWeek.current;
    shown?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [date, scrolls]);

  return (
    <nav
      ref={nav}
      aria-label="Days"
      className="food-strip"
      style={{ "--food-day": `${dayWidth}px` } as CSSProperties}
    >
      <div className="food-strip-scroller">
        <div className="food-strip-weeks">
          {weeks.map((week) => (
            <ol
              key={week[0]}
              ref={week.includes(date) ? shownWeek : undefined}
              aria-label={formatDateRange(week[0]!, week[6]!)}
              className="food-strip-week"
            >
              {week.map((day) => (
                <li key={day} ref={day === date ? shownDay : undefined}>
                  <DayLink
                    day={day}
                    today={today}
                    selected={date}
                    mark={marks.get(day)}
                    base={base}
                    letter
                  />
                </li>
              ))}
            </ol>
          ))}
        </div>
      </div>
      <span aria-hidden className="food-strip-fade" />
    </nav>
  );
}

/**
 * The calendar in the Food header (board Food), named by the month the day on screen falls in
 * and opening on it. The calendar goes back as far as there are days; the strip's own marks fill
 * every month it holds whole, and any other month is read when it is turned to.
 */
export function FoodCalendarButton({ from, ...props }: FoodDaysProps & { from: string }) {
  // A new key for every opening mounts the sheet afresh on the day on screen; closing keeps the
  // key, so the dialog is closed where it is and hands the focus back to this button.
  const [sheet, setSheet] = useState({ key: 0, open: false });
  const label = formatIsoMonth(monthOf(props.date), props.today.slice(0, 4));
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`${label}, calendar`}
        onClick={() => setSheet((current) => ({ key: current.key + 1, open: true }))}
        className="icon-button"
      >
        <Glyph name="calendar" className="glyph-24" />
      </button>
      {sheet.key > 0 && (
        <CalendarSheet
          key={sheet.key}
          open={sheet.open}
          onClose={() => setSheet((current) => ({ ...current, open: false }))}
          from={from}
          {...props}
        />
      )}
    </>
  );
}

/** Each month the strip holds from its first day, with the strip's days in it. */
function seedMonths(days: readonly FoodDayTotal[], from: string, current: string) {
  const seeded = new Map<string, FoodDayTotal[]>();
  for (let month = current; `${month}-01` >= from; month = addMonths(month, -1)) {
    seeded.set(month, []);
  }
  for (const day of days) seeded.get(monthOf(day.date))?.push(day);
  return seeded;
}

function CalendarSheet({
  open,
  onClose,
  today,
  date,
  days,
  from,
  targetKcal,
  base,
}: FoodDaysProps & { from: string; open: boolean; onClose: () => void }) {
  const current = monthOf(today);
  const [month, setMonth] = useState(() => monthOf(date));
  const [known, setKnown] = useState(() => seedMonths(days, from, current));

  useEffect(() => {
    if (known.has(month)) return;
    let live = true;
    readFoodMonthAction(month).then(
      (read) => {
        if (live) setKnown((before) => new Map(before).set(month, read));
      },
      // Offline, a month shows its days without their dots; turning to it again tries again.
      () => {},
    );
    return () => {
      live = false;
    };
  }, [month, known]);

  const marks = markDays(known.get(month) ?? [], targetKcal);
  const title = formatIsoMonth(month);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Calendar"
      footer={
        date === today ? undefined : (
          <Link
            href={base}
            prefetch="intent"
            onClick={onClose}
            className={cn(buttonClassName("secondary", "lg"), "w-full")}
          >
            Today
          </Link>
        )
      }
    >
      <div className="pb-1">
        <div className="food-calendar-head">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setMonth((shown) => addMonths(shown, -1))}
            className="icon-button"
          >
            <Glyph name="chevronLeft" className="glyph-22" />
          </button>
          <p aria-live="polite" className="type-heading tabular-nums">
            {title}
          </p>
          <button
            type="button"
            aria-label="Next month"
            disabled={month >= current}
            onClick={() => setMonth((shown) => addMonths(shown, 1))}
            className="icon-button"
          >
            <Glyph name="chevronRight" className="glyph-22" />
          </button>
        </div>
        <div aria-hidden className="food-calendar-letters">
          {["M", "T", "W", "T", "F", "S", "S"].map((letter, index) => (
            <span key={index}>{letter}</span>
          ))}
        </div>
        <ol aria-label={title} aria-busy={!known.has(month)} className="food-calendar-days">
          {monthGrid(month)
            .flat()
            .map((day, index) =>
              day ? (
                <li key={day}>
                  <DayLink
                    day={day}
                    today={today}
                    selected={date}
                    mark={marks.get(day)}
                    base={base}
                    onPick={onClose}
                  />
                </li>
              ) : (
                <li key={`blank-${index}`} aria-hidden />
              ),
            )}
        </ol>
      </div>
    </Sheet>
  );
}
