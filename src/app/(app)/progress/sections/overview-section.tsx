"use client";

import type { Route } from "next";
import { useSyncExternalStore } from "react";

import { Art } from "@/components/art/art";
import { RangeSpans } from "@/components/graph/graph";
import {
  ART_SPORT,
  monthDays,
  tally,
  tallyDistance,
  tallyName,
  type DayActivity,
} from "@/components/progress/calendar";
import Link from "@/components/ui/app-link";
import { Glyph } from "@/components/ui/glyphs";
import { InfoTip } from "@/components/ui/info-tip";
import { formatDateRange, formatIsoMonth, formatMinutes } from "@/lib/format";
import { PLATFORM_ATTRIBUTE } from "@/lib/platform";

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
 * Overview: the month on paper, its totals as its key, then every sport's totals over the span
 * every graph shares (ADR 0042), counted in full rather than sampled.
 */
export function OverviewSection({ month, overview }: Pick<ProgressData, "month" | "overview">) {
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
  const totals = overview.totals.filter((total) => total.count > 0);

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
                  {entry.metres !== null && (
                    <>
                      <br />
                      {tallyDistance(entry.metres)}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-meta text-ink-2">Nothing logged in {name} yet.</p>
        )}
      </section>

      {/* Every sport over the span the graphs share, chosen here as on every graph. */}
      <section aria-labelledby="progress-range" className="mt-6 border-t border-hair pt-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="progress-range" className="type-heading">
            Training totals
          </h2>
          <InfoTip label="What these totals count">
            Every activity in this span, counted in full rather than sampled. Recorded training
            time, not unique wall-clock time: overlapping sessions are counted once each. Distance
            is per sport and never added across them.
          </InfoTip>
        </div>
        <p className="type-meta-small font-semibold text-ink-2 tabular-nums">
          {formatDateRange(overview.range.from, overview.range.to)}
        </p>
        <RangeSpans name="totals" className="mt-2" />
        {totals.length > 0 ? (
          <ul className="mt-1">
            {totals.map((total, index) => (
              <li
                key={total.sport}
                className={index === totals.length - 1 ? "total-row plan-row-last" : "total-row"}
              >
                <span className="mark-cell">
                  <Art
                    kind="mark"
                    sport={ART_SPORT[total.sport as DayActivity["sport"]] ?? "strength"}
                    size={16}
                  />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="plan-row-name">{total.label}</span>
                  <span className="type-meta-small text-ink-2 tabular-nums">
                    {total.count} {total.count === 1 ? "session" : "sessions"} · {total.days}{" "}
                    {total.days === 1 ? "day" : "days"} · {formatMinutes(total.durationMs / 60_000)}
                    {total.distanceMetres !== null && total.distanceMetres > 0
                      ? ` · ${Math.round(total.distanceMetres / 100) / 10} km`
                      : ""}
                  </span>
                  {/* What the totals could not include, said rather than hidden. */}
                  {(total.unknownDistances > 0 || total.unknownDurations > 0) && (
                    <span className="type-caption font-medium text-ink-2">
                      {[
                        total.unknownDistances > 0
                          ? `${total.unknownDistances} without a distance`
                          : null,
                        total.unknownDurations > 0
                          ? `${total.unknownDurations} without a duration`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 type-meta text-ink-2">Nothing logged in this span.</p>
        )}
      </section>
    </>
  );
}
