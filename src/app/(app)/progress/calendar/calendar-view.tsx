"use client";

import type { Route } from "next";
import { useLayoutEffect } from "react";

import { Art } from "@/components/art/art";
import {
  ART_SPORT,
  monthDays,
  tally,
  tallyName,
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
}: {
  /** "2026-08", oldest first, this month last. */
  months: readonly string[];
  today: string;
  activities: readonly DayActivity[];
  truncated: boolean;
}) {
  const thisMonth = today.slice(0, 7);
  const thisYear = today.slice(0, 4);
  const day = Number(today.slice(8, 10));

  // It opens on this month, the last: the page starts at its end, unless Back brought it
  // somewhere else. Once more on the next frame, for anything that grew as it was laid out.
  useLayoutEffect(() => {
    if (window.scrollY !== 0) return;
    const toEnd = () => window.scrollTo({ top: document.documentElement.scrollHeight });
    toEnd();
    const frame = requestAnimationFrame(toEnd);
    return () => cancelAnimationFrame(frame);
  }, [thisMonth]);

  return (
    <div className="calendar">
      <div className="calendar-head">
        <PageHeader title="Calendar" backHref="/progress" />
      </div>
      <div className="page-width">
        {truncated && (
          <p role="status" className="mt-3 type-meta text-ink-2">
            The earliest months are not all shown: there is more here than one page reads.
          </p>
        )}
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
                days={monthDays(activities, month)}
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
  );
}
