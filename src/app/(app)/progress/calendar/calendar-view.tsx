"use client";

import type { Route } from "next";
import { useLayoutEffect, useRef } from "react";

import { Art } from "@/components/art/art";
import {
  ART_SPORT,
  monthDays,
  tally,
  tallyName,
  type DistanceUnits,
  type DayActivity,
} from "@/components/progress/calendar";
import { PageHeader } from "@/components/shell/page-header";
import { formatIsoMonth } from "@/lib/format";

/**
 * The months, a tile for each day with its date, oldest first, opening on this month: the
 * header stays while the months pass under it. Each month says how many
 * of each sport it holds, each count led by its icon, so the counts are its key.
 */
export function CalendarView({
  months,
  today,
  activities,
  truncated,
  units,
}: {
  /** "2026-08", oldest first, this month last. */
  months: readonly string[];
  today: string;
  activities: readonly DayActivity[];
  truncated: boolean;
  /** The units each sport's distances are said in, in each day's spoken name. */
  units?: DistanceUnits;
}) {
  const thisMonth = today.slice(0, 7);
  const thisYear = today.slice(0, 4);
  const day = Number(today.slice(8, 10));
  const head = useRef<HTMLDivElement>(null);

  // The header that stays is as tall as the reader's text and the notch make it: the page keeps
  // that much clear at its top (progress.css), so a month brought into view, or a day reached
  // with the keyboard, stands under it rather than behind it.
  useLayoutEffect(() => {
    const element = head.current;
    if (!element) return;
    const root = document.documentElement;
    const measure = () =>
      root.style.setProperty("--calendar-head", `${element.getBoundingClientRect().height}px`);
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      root.style.removeProperty("--calendar-head");
    };
  }, []);

  // It opens on this month: its name just under the header, on every screen. The months end
  // with this one, so where it is short the browser stops at the page's end, this month whole
  // above the foot and the months before it over it; where it is taller than the screen (large
  // text), its name is still the first thing under the header. Back keeps wherever it left the
  // page. Once more on the next frame, for anything that grew as it was laid out: the months
  // off the screen are laid out as they come near it.
  useLayoutEffect(() => {
    if (window.scrollY !== 0) return;
    const open = () => document.getElementById(`month-${thisMonth}`)?.scrollIntoView();
    open();
    const frame = requestAnimationFrame(open);
    return () => cancelAnimationFrame(frame);
  }, [thisMonth]);

  return (
    // Beyond a phone the months stand side by side, as many as hold a phone's month, read across
    // then down, oldest first; the screen is as wide as its size class allows (ADR 0052).
    <div className="calendar page-wide">
      <div ref={head} className="calendar-head">
        <PageHeader title="Calendar" backHref="/progress" />
      </div>
      <div className="page-width">
        {truncated && (
          <p role="status" className="mt-3 type-meta text-ink-2">
            The earliest months are not all shown: there is more here than one page reads.
          </p>
        )}
        <div className="calendar-months">
          {months.map((month) => {
            const current = month === thisMonth;
            const name = formatIsoMonth(month, thisYear);
            const year = month.slice(0, 4);
            const last = current
              ? day
              : Number(new Date(Date.UTC(Number(year), Number(month.slice(5, 7)), 0)).getUTCDate());
            const links = Object.fromEntries(
              Array.from({ length: last }, (_, i) => [
                i + 1,
                `/progress/day/${month}-${String(i + 1).padStart(2, "0")}` as Route,
              ]),
            );
            const counts = tally(activities.filter((a) => a.occurredOn.startsWith(month)));
            return (
              <section
                key={month}
                id={`month-${month}`}
                aria-labelledby={`month-name-${month}`}
                className="calendar-section"
              >
                <div className="calendar-month">
                  <h2 id={`month-name-${month}`}>{name}</h2>
                  {counts.length > 0 && (
                    <ul aria-label={`In ${formatIsoMonth(month, "")}`} className="calendar-counts">
                      {counts.map((entry) => (
                        <li key={entry.sport}>
                          <Art kind="icon" sport={ART_SPORT[entry.sport]} />
                          {entry.count}
                          <span className="sr-only"> {tallyName(entry.sport, entry.count)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <Art
                  kind="month"
                  month={month}
                  days={monthDays(activities, month, units)}
                  today={current ? day : null}
                  dates
                  cellHeight={58}
                  links={links}
                  label={`${formatIsoMonth(month, "")}, every activity of every day`}
                />
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
