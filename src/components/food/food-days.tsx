"use client";

import type { Route } from "next";
import { useEffect, useRef, useState } from "react";

import Link from "@/components/ui/app-link";
import { buttonClassName } from "@/components/ui/button";
import { ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";
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

/** A mark's pen: plain where food was logged, green where the goal was met, amber where it was passed. */
const MARK_INK: Record<FoodDayMark, string> = {
  logged: "text-ink-subtle",
  met: "text-success",
  over: "text-warning",
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

/**
 * How a day went, under its number, as a shape as well as a colour: a dot where food was
 * logged, a tick where the goal was met, an arrow where the day went past it. On the
 * highlighter the mark is drawn in the cell's own ink, since the cell is already the loudest
 * thing on the strip and the shape says the rest.
 */
function DayMark({ mark, onHighlight }: { mark: FoodDayMark | undefined; onHighlight: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-3.5 items-center justify-center",
        onHighlight ? "text-on-highlight" : mark && MARK_INK[mark],
      )}
    >
      {mark === "met" ? (
        <Check className="!size-3.5" />
      ) : mark === "over" ? (
        <ArrowUp className="!size-3.5" />
      ) : mark === "logged" ? (
        <span className="size-1.5 rounded-full bg-current" />
      ) : null}
    </span>
  );
}

/** The geometry every day cell shares, in the strip and on the calendar, so the columns line up. */
const CELL_CLASS =
  "flex h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-control border";
const NUMBER_CLASS = "font-data text-sm leading-none font-semibold tabular-nums";

/**
 * One day as a cell of the strip, the way a day of the cycle is: today under the highlighter,
 * the day on screen ruled in ink, every other day outlined, and under each number the mark
 * that says how it went. A day still to come is written in pencil, with no cell drawn around
 * it, and cannot be opened.
 */
function DayLink({
  day,
  today,
  selected,
  mark,
  base,
  calendar = false,
  onPick,
}: {
  day: string;
  today: string;
  selected: string;
  mark: FoodDayMark | undefined;
  base: Route;
  /** On the calendar only the days that say something are outlined, or a month is all lines. */
  calendar?: boolean;
  onPick?: () => void;
}) {
  const number = Number(day.slice(8));
  if (day > today) {
    return (
      <span className={cn(CELL_CLASS, "border-transparent text-ink-ghost")}>
        <span className={NUMBER_CLASS}>{number}</span>
        <DayMark mark={undefined} onHighlight={false} />
      </span>
    );
  }
  const isToday = day === today;
  const isSelected = day === selected;
  const label = [formatIsoLongDay(day), isToday ? "today" : null, mark ? MARK_WORDS[mark] : null]
    .filter(Boolean)
    .join(", ");
  return (
    <Link
      href={dayHref(base, day, today)}
      prefetch="intent"
      aria-label={label}
      aria-current={isSelected ? "page" : undefined}
      onClick={onPick}
      className={cn(
        CELL_CLASS,
        "transition-colors duration-[var(--ov-duration-feedback)] focus-visible:-outline-offset-2",
        isToday
          ? "border-highlight-strong bg-highlight text-on-highlight active:bg-highlight-strong"
          : isSelected
            ? "border-ink bg-surface text-ink active:bg-surface-raised"
            : cn(
                calendar ? "border-transparent" : "border-line",
                "text-ink-muted active:bg-surface-raised",
              ),
      )}
    >
      <span aria-hidden className={NUMBER_CLASS}>
        {number}
      </span>
      <DayMark mark={mark} onHighlight={isToday} />
    </Link>
  );
}

/** The weekday letters over the cells, each in its column. */
function WeekdayLetters({ letters }: { letters: readonly string[] }) {
  return (
    <div
      aria-hidden
      className="grid grid-cols-7 gap-1 text-center font-data text-xs font-medium text-ink-muted"
    >
      {letters.map((letter, index) => (
        <span key={index}>{letter}</span>
      ))}
    </div>
  );
}

/**
 * The days under the Food header (ADR 0037): weeks of seven ending on today, so yesterday is
 * always one tap away, with earlier weeks a swipe away to the left. The newest week is where the
 * strip rests, as it is laid out from the right; a day further back brings its own week into view.
 */
export function FoodWeekStrip({ today, date, days, targetKcal, base }: FoodDaysProps) {
  const weeks = stripWeeks(today, date);
  const marks = markDays(days, targetKcal);
  const shown = useRef<HTMLOListElement>(null);

  useEffect(() => {
    shown.current?.scrollIntoView?.({ block: "nearest", inline: "start" });
  }, [date]);

  return (
    <nav aria-label="Days" className="space-y-1.5 py-3 rule-bottom rule-top">
      <WeekdayLetters letters={weeks[0]!.map((day) => formatIsoWeekdayLetter(day))} />
      <div className="flex snap-x snap-mandatory [scrollbar-width:none] flex-row-reverse gap-3 overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:hidden">
        {weeks.map((week) => (
          <ol
            key={week[0]}
            ref={week.includes(date) ? shown : undefined}
            aria-label={formatDateRange(week[0]!, week[6]!)}
            className="grid w-full shrink-0 snap-start grid-cols-7 gap-1"
          >
            {week.map((day) => (
              <li key={day} className="min-w-0">
                <DayLink
                  day={day}
                  today={today}
                  selected={date}
                  mark={marks.get(day)}
                  base={base}
                />
              </li>
            ))}
          </ol>
        ))}
      </div>
    </nav>
  );
}

/**
 * The month the day on screen falls in, in the Food header, opening the calendar on it. The
 * calendar goes back as far as there are days; the strip's own marks fill every month it holds
 * whole, and any other month is read when it is turned to.
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
        className="-mr-1.5 flex min-h-11 items-center gap-0.5 rounded-control px-1.5 font-data text-sm font-semibold text-pen transition-colors duration-[var(--ov-duration-feedback)] hover:text-pen-strong active:bg-surface-raised"
      >
        {label}
        <ChevronDown aria-hidden />
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

const ARROW_CLASS =
  "flex size-11 shrink-0 items-center justify-center rounded-control text-pen transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised disabled:opacity-40";

/** The calendar is laid out Monday first, whatever day the strip's weeks end on. */
const CALENDAR_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

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
      // Offline, a month shows its days without their marks; turning to it again tries again.
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
      <div className="space-y-2 pb-1">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setMonth((shown) => addMonths(shown, -1))}
            className={ARROW_CLASS}
          >
            <ChevronLeft aria-hidden />
          </button>
          <p aria-live="polite" className="min-w-0 font-data font-semibold tabular-nums">
            {title}
          </p>
          <button
            type="button"
            aria-label="Next month"
            disabled={month >= current}
            onClick={() => setMonth((shown) => addMonths(shown, 1))}
            className={ARROW_CLASS}
          >
            <ChevronRight aria-hidden />
          </button>
        </div>
        <WeekdayLetters letters={CALENDAR_LETTERS} />
        <ol aria-label={title} aria-busy={!known.has(month)} className="grid grid-cols-7 gap-1">
          {monthGrid(month)
            .flat()
            .map((day, index) =>
              day ? (
                <li key={day} className="min-w-0">
                  <DayLink
                    day={day}
                    today={today}
                    selected={date}
                    mark={marks.get(day)}
                    base={base}
                    calendar
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
