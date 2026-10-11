"use client";

import { useEffect } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { todayInTimeZone } from "@/domain/program-calendar";

/**
 * An installed app may stay open overnight. Open drafts retain their own original day.
 *
 * Once the account's day has changed, the Food screen moves on to the new one (ADR 0037, decision
 * 5). A meal's page showing today passes `keep`, its own address on that day, and stays there
 * instead, the day now written in its header: what is being added to the meal is not moved to
 * the next day under the athlete's thumb. Its address changes in place, so a sheet open on it
 * stays open.
 */
export function FoodDayRollover({
  today,
  timeZone,
  keep,
}: {
  today: string;
  timeZone: string;
  keep?: Route;
}) {
  const router = useRouter();
  useEffect(() => {
    const check = () => {
      if (
        document.visibilityState === "visible" &&
        navigator.onLine &&
        todayInTimeZone(timeZone) !== today
      ) {
        if (keep) router.replace(keep, { scroll: false });
        else router.refresh();
      }
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
  }, [today, timeZone, keep, router]);
  return null;
}
