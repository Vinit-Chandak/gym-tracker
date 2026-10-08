"use client";

import type { Route } from "next";
import { useSyncExternalStore } from "react";

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
import { PLATFORM_ATTRIBUTE } from "@/lib/platform";

import { HistoryList } from "../history/history-list";
import type { ProgressData } from "../progress-types";

const subscribeResize = (onChange: () => void) => {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
};
const noSubscription = () => () => {};

/**
 * The calendar's cells are as tall as the phone gives them (the generator's rule): 42 pt under
 * 360 wide, 44 on a short screen, 58 on a tall one, 50 otherwise. Each day is a link, so its
 * cell is never shorter than a target: 44 pt, 48 dp on Android.
 */
function useCellHeight(): number {
  const size = useSyncExternalStore(
    subscribeResize,
    () => `${window.innerWidth}x${window.innerHeight}`,
    () => "402x874",
  );
  const android = useSyncExternalStore(
    noSubscription,
    () => document.documentElement.getAttribute(PLATFORM_ATTRIBUTE) === "android",
    () => false,
  );
  const [width, height] = size.split("x").map(Number) as [number, number];
  const fit = width < 360 || height < 800 ? 44 : height >= 860 ? 58 : 50;
  return Math.max(android ? 48 : 44, fit);
}

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
 * and time), then the latest ten activities as History lists them. The list is the calendar
 * read back from today: it runs on past the month's first day when the month holds fewer, each
 * earlier month under its name, and History holds the rest.
 */
export function OverviewSection({
  month,
  overview,
  today,
}: Pick<ProgressData, "month" | "overview" | "today">) {
  const cellHeight = useCellHeight();
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
          cellHeight={cellHeight}
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

      {/* The latest ten, as History lists them; History, one tap on, holds every one. */}
      {overview.latest.length > 0 && (
        <section aria-labelledby="progress-latest" className="mt-6 border-t border-hair pt-3">
          <h2 id="progress-latest" className="month-head">
            <span>Latest</span>
            <Link href="/progress/history" className="month-head-link">
              History
              <Glyph name="chevronRight" className="glyph-18" />
            </Link>
          </h2>
          <HistoryList items={overview.latest} today={today} level={3} month={month.month} />
        </section>
      )}
    </>
  );
}
