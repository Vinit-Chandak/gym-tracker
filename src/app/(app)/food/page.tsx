import type { Metadata } from "next";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { foodDayFrom, stripRange } from "@/domain/food-days";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { readFoodDay, readFoodDays } from "@/server/repositories/nutrition";

import { FoodView } from "./food-view";

export const metadata: Metadata = { title: "Food" };

/**
 * Coming back to this tab within a minute shows what it showed, without asking the server
 * (ADR 0030). Any change made in the app clears that copy at once; only a change made
 * elsewhere, on another device, can take up to the minute to appear.
 */
export const unstable_dynamicStaleTime = 60;

/** Today, or with `?day=` any day before it (ADR 0037), with the days in the strip marked. */
export default async function FoodPage(props: PageProps<"/food">) {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const today = todayInTimeZone(profile.timeZone);
  const date = foodDayFrom((await props.searchParams).day, today);
  const [day, days] = await withUser(
    getDb(),
    user.id,
    (tx) =>
      Promise.all([
        readFoodDay(tx, user.id, date),
        readFoodDays(tx, user.id, stripRange(today, date)),
      ]),
    { readOnly: true },
  );

  return (
    <FoodView
      timeZone={profile.timeZone}
      today={today}
      date={date}
      day={day}
      days={days}
      bodyWeightKg={profile.bodyWeightKg}
      goal={profile.trainingGoal}
    />
  );
}
