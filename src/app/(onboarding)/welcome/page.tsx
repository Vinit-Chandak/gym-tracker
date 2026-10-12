import type { Metadata } from "next";
import { headers } from "next/headers";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { resolveSportUnits } from "@/lib/distance-units";
import { firstAcceptedLanguage } from "@/lib/setup-path";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { hasChosenSports, enabledSportsFor } from "@/server/repositories/sport-preferences";

import { YouStep } from "./you-step";

export const metadata: Metadata = { title: "Welcome" };

/**
 * Setup's first step (board You), straight after sign-up: which sounds like you and what you
 * train, with the units and the zone the phone proposes. Nothing given at sign-up (the name,
 * the username) is asked again.
 */
export default async function WelcomePage() {
  const user = await requireUser();
  // The cached read: it writes only for a missing profile, where this used to lock every visit.
  const profile = await getRequestProfile(user.id, user.email, user.displayName);
  const sports = await withUser(
    getDb(),
    user.id,
    async (tx) => ((await hasChosenSports(tx, user.id)) ? enabledSportsFor(tx, user.id) : null),
    { readOnly: true },
  );
  const distances = resolveSportUnits(profile.preferredUnit, profile);
  const language = firstAcceptedLanguage((await headers()).get("accept-language"));

  return (
    <YouStep
      name={profile.displayName}
      experience={profile.trainingExperience}
      sports={sports}
      // Coming back to the step shows what was chosen; a first visit reads the phone.
      units={
        sports
          ? {
              weight: profile.preferredUnit === "lb" ? "lb" : "kg",
              distance: distances.distanceUnit,
              pool: distances.poolUnit,
            }
          : null
      }
      zone={profile.timeZone === "UTC" && !sports ? null : profile.timeZone}
      language={language}
    />
  );
}
