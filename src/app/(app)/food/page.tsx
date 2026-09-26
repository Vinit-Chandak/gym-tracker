import type { Metadata } from "next";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { readFoodDay } from "@/server/repositories/nutrition";

import { FoodView } from "./food-view";

export const metadata: Metadata = { title: "Food" };

/**
 * Coming back to this tab within a minute shows what it showed, without asking the server
 * (ADR 0030). Any change made in the app clears that copy at once; only a change made
 * elsewhere, on another device, can take up to the minute to appear.
 */
export const unstable_dynamicStaleTime = 60;

export default async function FoodPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const today = todayInTimeZone(profile.timeZone);
  const day = await withUser(getDb(), user.id, (tx) => readFoodDay(tx, user.id, today), {
    readOnly: true,
  });

  return (
    <FoodView
      timeZone={profile.timeZone}
      today={today}
      day={day}
      bodyWeightKg={profile.bodyWeightKg}
      unit={profile.preferredUnit === "lb" ? "lb" : "kg"}
    />
  );
}
