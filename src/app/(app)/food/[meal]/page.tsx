import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { foodDayFrom } from "@/domain/food-days";
import { mealFromSlug } from "@/domain/nutrition";
import { todayInTimeZone } from "@/domain/program-calendar";
import { MEAL_LABELS } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { readMealScreen } from "@/server/repositories/nutrition";

import { MealView } from "./meal-view";

export async function generateMetadata(props: PageProps<"/food/[meal]">): Promise<Metadata> {
  const meal = mealFromSlug((await props.params).meal);
  return { title: meal ? MEAL_LABELS[meal] : "Food" };
}

/**
 * One of the day's seven meals: `/food/breakfast` to `/food/late-night-snack`, today's or, with
 * `?day=`, any day's before it (ADR 0037).
 */
export default async function MealPage(props: PageProps<"/food/[meal]">) {
  const meal = mealFromSlug((await props.params).meal);
  if (!meal) notFound();
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const today = todayInTimeZone(profile.timeZone);
  const date = foodDayFrom((await props.searchParams).day, today);
  const screen = await withUser(
    getDb(),
    user.id,
    (tx) => readMealScreen(tx, user.id, { eatenOn: date, meal }),
    { readOnly: true },
  );
  return (
    <MealView
      timeZone={profile.timeZone}
      today={today}
      date={date}
      meal={meal}
      screen={screen}
      backHref={date === today ? "/food" : (`/food?day=${date}` as Route)}
    />
  );
}
