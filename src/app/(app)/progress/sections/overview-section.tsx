"use client";

import type { Route } from "next";

import { Art } from "@/components/art/art";
import {
  ART_SPORT,
  monthDays,
  tally,
  tallyDistance,
  tallyName,
  type SportTally,
} from "@/components/progress/calendar";
import Link from "@/components/ui/app-link";
import { Glyph } from "@/components/ui/glyphs";
import { formatIsoMonth, formatMinutes } from "@/lib/format";

import { HistoryList } from "../history/history-list";
import type { ProgressData } from "../progress-types";

/**
 * What a month's sport added up to, under its name: how far, then how long. Each figure keeps
 * its unit, so a narrow column breaks "18 h 26 min" between the hours and the minutes.
 */
function measures(entry: SportTally): string[] {
  return [
    entry.metres === null ? null : tallyDistance(entry.metres),
    entry.ms === null ? null : formatMinutes(entry.ms / 60_000),
  ]
    .filter((line) => line !== null)
    .map((line) => line.replace(/(\d) /g, "$1\u00a0"));
}

/**
 * Overview (ADR 0045): the month on paper, its totals as its key (each sport's count, distance
 * and time), then History, the latest ten activities. The list is the calendar read back from
 * today: it runs on past the month's first day when the month holds fewer, each earlier month
 * under its name, and the page behind it holds every entry.
 */
export function OverviewSection({
  month,
  overview,
  today,
}: Pick<ProgressData, "month" | "overview" | "today">) {
  const year = month.month.slice(0, 4);
  const name = formatIsoMonth(month.month, year);
  const days = monthDays(month.activities, month.month);
  const links = Object.fromEntries(
    Array.from({ length: month.today }, (_, i) => [
      i + 1,
      `/progress/day/${month.month}-${String(i + 1).padStart(2, "0")}` as Route,
    ]),
  );
  const tallies = tally(month.activities);

  return (
    <>
      <section aria-labelledby="progress-month" className="mt-2">
        <h2 id="progress-month" className="month-head">
          <span>{name}</span>
          <Link href="/progress/calendar" className="month-head-link">
            Calendar
            <Glyph name="chevronRight" className="glyph-18" />
          </Link>
        </h2>
        <Art
          kind="month"
          month={month.month}
          days={days}
          today={month.today}
          // Each day as tall as the screen gives it, from the stylesheet (progress.css), so
          // the month is drawn at its height on the first paint and never jumps after.
          links={links}
          label={`${name} ${year}, every activity of every day`}
        />
      </section>

      {/* The month's totals, each led by its icon: the calendar's key and its count at once. */}
      <section aria-labelledby="progress-month-totals" className="month-totals">
        <h2 id="progress-month-totals" className="sr-only">
          Sessions in {name}
        </h2>
        {tallies.length > 0 ? (
          <ul>
            {tallies.map((entry) => (
              <li key={entry.sport}>
                <span className="flex items-center gap-1.5">
                  <Art kind="icon" sport={ART_SPORT[entry.sport]} />
                  <span className="type-figure-l">{entry.count}</span>
                </span>
                <span className="month-total-name">
                  {tallyName(entry.sport, entry.count)}
                  {measures(entry).map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-meta text-ink-2">Nothing logged in {name} yet.</p>
        )}
      </section>

      {/* History: the latest ten under the month, every entry one tap on. */}
      {overview.latest.length > 0 && (
        <section aria-labelledby="progress-history" className="mt-6 border-t border-hair pt-3">
          <h2 id="progress-history" className="month-head">
            <span>History</span>
            <Link href="/progress/history" aria-label="All history" className="month-head-link">
              All
              <Glyph name="chevronRight" className="glyph-18" />
            </Link>
          </h2>
          <HistoryList items={overview.latest} today={today} level={3} month={month.month} />
        </section>
      )}
    </>
  );
}
