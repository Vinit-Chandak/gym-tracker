"use client";

import type { Route } from "next";

import { Art } from "@/components/art/art";
import {
  ART_SPORT,
  monthDays,
  tally,
  tallyDistance,
  tallyName,
  type DistanceUnits,
  type SportTally,
} from "@/components/progress/calendar";
import Link from "@/components/ui/app-link";
import { Figures } from "@/components/ui/figures";
import { Glyph } from "@/components/ui/glyphs";
import { NavRow } from "@/components/ui/nav-row";
import { formatIsoMonth, formatMinutes } from "@/lib/format";

import type { ProgressData } from "../progress-types";

/**
 * What a month's sport added up to, under its name: how far, then how long. Each figure keeps
 * its unit, so a narrow column breaks "18 h 26 min" between the hours and the minutes.
 */
function measures(entry: SportTally, units?: DistanceUnits): string[] {
  return [
    entry.metres === null ? null : tallyDistance(entry.metres, entry.sport, units),
    entry.ms === null ? null : formatMinutes(entry.ms / 60_000),
  ]
    .filter((line) => line !== null)
    .map((line) => line.replace(/(\d) /g, "$1\u00a0"));
}

/**
 * Overview (ADR 0045, amended 28 October 2026): the month on paper and its totals as its key
 * (each sport's count, distance and time), one card, then History, one row. The month already
 * draws every activity of every day, so the list of the latest that stood under it said them a
 * second time (owner: each thing once); History's page holds every entry, with its filters.
 */
export function OverviewSection({
  month,
  calendarHref = "/progress/calendar",
  historyHref = "/progress/history",
  dayHrefs,
}: Pick<ProgressData, "month"> & {
  /** Alternate destinations for fixture previews; null omits an unavailable calendar. */
  calendarHref?: Route | null;
  historyHref?: Route;
  dayHrefs?: Record<number, Route>;
}) {
  const year = month.month.slice(0, 4);
  const name = formatIsoMonth(month.month, year);
  const days = monthDays(month.activities, month.month, month.units);
  const links =
    dayHrefs ??
    Object.fromEntries(
      Array.from({ length: month.today }, (_, i) => [
        i + 1,
        `/progress/day/${month.month}-${String(i + 1).padStart(2, "0")}` as Route,
      ]),
    );
  const tallies = tally(month.activities);

  return (
    <div className="overview">
      <section aria-labelledby="progress-month">
        <h2 id="progress-month" className="month-head">
          <span>{name}</span>
          {calendarHref && (
            <Link href={calendarHref} className="month-head-link">
              Calendar
              <Glyph name="chevronRight" className="glyph-18" />
            </Link>
          )}
        </h2>
        {/* The month and its key are one card: the paper, then each sport's count under it. */}
        <div className="month-card">
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
                      {measures(entry, month.units).map((line) => (
                        <span key={line} className="block">
                          <Figures>{line}</Figures>
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              // The month is named over its paper.
              <p className="type-meta text-ink-2">Nothing logged yet.</p>
            )}
          </section>
        </div>
      </section>
      {/* Every entry, in pages with its filters, one tap on. */}
      <ul className="ov-panel ov-panel-list overview-history">
        <NavRow href={historyHref} glyph="history" label="History" />
      </ul>
    </div>
  );
}
