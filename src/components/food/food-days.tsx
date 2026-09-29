"use client";

import type { Route } from "next";
import { useEffect, useRef, useState } from "react";

import Link from "@/components/ui/app-link";
import { buttonClassName } from "@/components/ui/button";
import { ChevronDown, ChevronLeft, ChevronRight } from "@/components/ui/icons";
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

/** A dot's colour: green where the goal was met, amber where it was passed, plain otherwise. */
const MARK_FILL: Record<FoodDayMark, string> = {
  logged: "bg-ink-subtle",
  met: "bg-success",
  over: "bg-warning",
};

/** What a dot says to someone who cannot see it. */
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
 * One day: its number in a circle, filled when it is the day on screen and ringed when it is
 * today, over the dot that says whether it has food on it and how it went. A day still to come is
 * shown but cannot be opened.
 */
function DayLink({
  day,
  today,
  selected,
  mark,
  base,
  onPick,
}: {
  day: string;
  today: string;
  selected: string;
  mark: FoodDayMark | undefined;
  base: Route;
  onPick?: () => void;
}) {
  const number = Number(day.slice(8));
  if (day > today) {
    return (
      <span className="flex flex-col items-center gap-1 py-1 text-sm text-ink-muted tabular-nums">
        <span className="flex aspect-square w-9 max-w-full items-center justify-center">
          {number}
        </span>
        <span aria-hidden className="size-1.5" />
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
      className="flex flex-col items-center gap-1 rounded-control py-1 transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised"
    >
      <span
        aria-hidden
        className={cn(
          "flex aspect-square w-9 max-w-full items-center justify-center rounded-full text-sm tabular-nums",
          day === selected
            ? "bg-accent font-semibold text-on-accent"
            : isToday && "border border-line-strong font-semibold",
        )}
      >
        {number}
      </span>
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", mark ? MARK_FILL[mark] : "invisible")}
      />
    </Link>
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
    <nav aria-label="Days" className="space-y-1">
      <div aria-hidden className="grid grid-cols-7 text-center text-xs font-medium text-ink-muted">
        {weeks[0]!.map((day) => (
          <span key={day}>{formatIsoWeekdayLetter(day)}</span>
        ))}
      </div>
      <div className="flex snap-x snap-mandatory [scrollbar-width:none] flex-row-reverse overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:hidden">
        {weeks.map((week) => (
          <ol
            key={week[0]}
            ref={week.includes(date) ? shown : undefined}
            aria-label={formatDateRange(week[0]!, week[6]!)}
            className="grid w-full shrink-0 snap-start grid-cols-7"
          >
            {week.map((day) => (
              <li key={day}>
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
        className="-mr-1 flex min-h-11 items-center gap-1 rounded-control px-1 text-sm font-medium transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised"
      >
        {label}
        <ChevronDown className="text-ink-subtle" aria-hidden />
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
  "flex size-11 items-center justify-center rounded-control text-ink-subtle transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised disabled:opacity-40";

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
          <p aria-live="polite" className="font-medium tabular-nums">
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
        <div
          aria-hidden
          className="grid grid-cols-7 text-center text-xs font-medium text-ink-muted"
        >
          {["M", "T", "W", "T", "F", "S", "S"].map((letter, index) => (
            <span key={index}>{letter}</span>
          ))}
        </div>
        <ol aria-label={title} aria-busy={!known.has(month)} className="grid grid-cols-7">
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
