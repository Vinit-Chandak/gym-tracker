"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { todayInTimeZone } from "@/domain/program-calendar";

/** How long a screen that still shows the old day after a refresh waits to ask again. */
const RETRY_MS = 5 * 60_000;

/** Screens that keep their own day past midnight, and so are not refreshed by the shell. */
let keepers = 0;

/**
 * Brings the screen onto the new day when the athlete's day changes under it.
 *
 * A phone keeps the installed app's page in memory, so opening it in the morning shows the
 * screen it showed last night, and a tab can stay open across midnight. Today, Training,
 * Progress and Food are rendered for the day they were asked for, in the account's time zone,
 * and nothing asked again until the athlete moved: Today kept last night's date, called last
 * night's workout done today and left out today's sessions, while Start and Skip acted on the
 * real day. So once a minute, when the app is shown again and when the connection comes back,
 * the day the shell was rendered for is compared with the day it is now in that zone, and a
 * different one refreshes the screen. One check in the shell serves every tab.
 *
 * The shell keeps the day from its own last render, so after a midnight passed while moving
 * between tabs it is the one behind, and costs one refresh. A workout's own screens are left
 * alone: they do not show the day, and a set being typed is not interrupted. A device clock a
 * little ahead of the server's can refresh onto the same day; it asks again only after a few
 * minutes, not every minute.
 *
 * A meal's page showing today passes `keep`, its own address on that day, and stays there
 * instead, the day now written in its header (ADR 0037, decision 5): what is being added to the
 * meal is not moved to the next day under the athlete's thumb. Its address changes in place, so
 * a sheet open on it stays open, and while it is up the shell leaves the screen to it. Open food
 * drafts retain their own original day.
 */
export function DayRollover({
  today,
  timeZone,
  keep,
}: {
  today: string;
  timeZone: string;
  keep?: Route;
}) {
  const router = useRouter();
  const inWorkout = usePathname().startsWith("/workouts/");
  const refreshedAt = useRef(Number.NEGATIVE_INFINITY);

  useEffect(() => {
    if (!keep) return;
    keepers += 1;
    return () => {
      keepers -= 1;
    };
  }, [keep]);

  useEffect(() => {
    if (inWorkout) return;
    const check = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      if (todayInTimeZone(timeZone) === today) return;
      if (keep) {
        router.replace(keep, { scroll: false });
        return;
      }
      if (keepers > 0) return;
      const now = Date.now();
      if (now - refreshedAt.current < RETRY_MS) return;
      refreshedAt.current = now;
      router.refresh();
    };
    check();
    const interval = window.setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("online", check);
    };
  }, [today, timeZone, keep, inWorkout, router]);

  return null;
}
