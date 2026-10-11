import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireProfiledUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { readSetupState } from "@/server/queries/setup-state";

import { PlaceStep } from "./place-step";

export const metadata: Metadata = { title: "Where you train" };

/**
 * Setup's second step for a lifter (board Where you train). Someone who has not answered the
 * first step yet is sent to it; someone coming back sees the place they gave, to change it.
 */
export default async function WelcomeGymPage() {
  const user = await requireProfiledUser();
  const profile = await getRequestProfile(user.id, user.email, user.displayName);
  const state = await withUser(
    getDb(),
    user.id,
    (tx) => readSetupState(tx, user.id, profile.trainingExperience),
    { readOnly: true },
  );
  if (state.experience === null || state.sports === null || !state.sports.includes("strength"))
    redirect("/welcome");

  return (
    <PlaceStep
      experience={state.experience}
      place={state.place ? { kind: state.place.kind, name: state.place.name } : null}
    />
  );
}
