"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { todayInTimeZone } from "@/domain/program-calendar";

/** An installed app may stay open overnight. Open drafts retain their own original day. */
export function FoodDayRollover({ today, timeZone }: { today: string; timeZone: string }) {
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
