import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
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

/** One of the day's six meals: `/food/breakfast` to `/food/evening-snack`. */
export default async function MealPage(props: PageProps<"/food/[meal]">) {
  const meal = mealFromSlug((await props.params).meal);
  if (!meal) notFound();
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const today = todayInTimeZone(profile.timeZone);
  const screen = await withUser(
    getDb(),
    user.id,
    (tx) => readMealScreen(tx, user.id, { eatenOn: today, meal }),
    { readOnly: true },
  );
  return <MealView timeZone={profile.timeZone} today={today} meal={meal} screen={screen} />;
}
