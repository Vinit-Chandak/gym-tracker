"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { todayInTimeZone } from "@/domain/program-calendar";

/**
 * Renders a screen keyed to the day again once that day is over. An installed app may stay open
 * overnight, and a phone resumes it showing the last screen from memory (ADR 0050), so Today
 * and Food would otherwise go on saying yesterday's date, and what was done yesterday, until
 * something else was tapped. Checked when the app is shown again, when it comes back online,
 * and once a minute while it is open. Open food drafts retain their own original day.
 */
export function DayRollover({ today, timeZone }: { today: string; timeZone: string }) {
  const router = useRouter();
  useEffect(() => {
    const check = () => {
      if (
        document.visibilityState === "visible" &&
        navigator.onLine &&
        todayInTimeZone(timeZone) !== today
      )
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
  }, [today, timeZone, router]);
  return null;
}
