import type { Metadata } from "next";

import { monthsBetween, type DayActivity } from "@/components/progress/calendar";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { addDays, todayInTimeZone } from "@/domain/program-calendar";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { readActivityDays, readFirstActivityDay } from "@/server/repositories/activity-analytics";

import { CalendarView } from "./calendar-view";

export const metadata: Metadata = { title: "Calendar" };

/** How far back the calendar reaches: two years of months, from the first with anything in it. */
const MONTHS_BACK = 23;

/**
 * The calendar (board Calendar): the months one after another, each on its paper with its
 * dates, opening on this month; every past day opens on its own record.
 */
export default async function CalendarPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const today = todayInTimeZone(profile.timeZone);
  const thisMonth = today.slice(0, 7);
  // Two years before this month's first day, as a month.
  const earliest = addDays(`${thisMonth}-01`, -MONTHS_BACK * 31).slice(0, 7);

  const { activities, truncated, first } = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const firstDay = await readFirstActivityDay(tx, user.id);
      const firstMonth =
        firstDay && firstDay.slice(0, 7) > earliest ? firstDay.slice(0, 7) : earliest;
      const start = firstDay ? firstMonth : thisMonth;
      const read = await readActivityDays(tx, user.id, { from: `${start}-01`, to: today });
      return { activities: read.items, truncated: read.truncated, first: start };
    },
    { readOnly: true },
  );

  return (
    <CalendarView
      months={monthsBetween(`${first}-01`, today)}
      today={today}
      truncated={truncated}
      activities={activities.map((item): DayActivity => ({
        sport: item.sport,
        occurredOn: item.occurredOn,
        durationMs: item.durationMs,
        distanceMetres: item.distanceMetres,
        environment: item.environment,
      }))}
    />
  );
}
