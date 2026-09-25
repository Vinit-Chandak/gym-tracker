import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { suggestMealName } from "@/domain/nutrition";
import { hourInTimeZone, todayInTimeZone } from "@/domain/program-calendar";
import { foodTrackingEnabled } from "@/lib/env";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { readFoodScreen } from "@/server/repositories/nutrition";

import { FoodView } from "./food-view";

export const metadata: Metadata = { title: "Food" };

/** Hidden behind `FOOD_TRACKING_ENABLED` (ADR 0032): for everyone else the screen is not there. */
export default async function FoodPage() {
  const user = await requireUser();
  if (!foodTrackingEnabled(user.email)) notFound();
  const profile = await getRequestProfile(user.id, user.email);
  const now = new Date();
  const today = todayInTimeZone(profile.timeZone, now);
  const screen = await withUser(getDb(), user.id, (tx) => readFoodScreen(tx, user.id, today), {
    readOnly: true,
  });

  return (
    <FoodView
      today={today}
      screen={screen}
      bodyWeightKg={profile.bodyWeightKg}
      unit={profile.preferredUnit === "lb" ? "lb" : "kg"}
      suggestedName={suggestMealName(
        screen.meals.map((meal) => meal.name),
        hourInTimeZone(profile.timeZone, now),
      )}
    />
  );
}
