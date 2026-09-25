import type { Metadata } from "next";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { suggestMealName } from "@/domain/nutrition";
import { hourInTimeZone, todayInTimeZone } from "@/domain/program-calendar";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { readFoodScreen } from "@/server/repositories/nutrition";

import { FoodView } from "./food-view";

export const metadata: Metadata = { title: "Food" };

export default async function FoodPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const now = new Date();
  const today = todayInTimeZone(profile.timeZone, now);
  const screen = await withUser(getDb(), user.id, (tx) => readFoodScreen(tx, user.id, today), {
    readOnly: true,
  });

  return (
    <FoodView
      userId={user.id}
      timeZone={profile.timeZone}
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
