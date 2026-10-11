import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SetupCoach } from "@/components/coaching/setup-coach";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { placeInSentence } from "@/lib/setup-place";
import { requireProfiledUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { readSetupState, setupStepsOf } from "@/server/queries/setup-state";

import { OnboardingFrame } from "../../onboarding-frame";

export const metadata: Metadata = { title: "What should the coach plan?" };

/**
 * Board What should the coach plan?: the coach's questions for someone who already trains, from
 * How do you want to start?. One screen in the setup frame, with one title and one Back (audit
 * U4, U12): what setup already knows is said in the line under the title, not asked again.
 */
export default async function WelcomeCoachPage() {
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
  if (!state.place) redirect("/welcome/gym");
  // A beginner's coach questions are their plan step itself.
  if (state.experience !== "experienced") redirect("/welcome/programme");
  const runs = state.sports.includes("running");

  return (
    <OnboardingFrame
      steps={setupStepsOf(state)}
      current="start"
      back="/welcome/programme"
      title="What should the coach plan?"
      sub={`It already knows ${placeInSentence(state.place)}, that you train${runs ? ", and that you run" : ""}.`}
    >
      <SetupCoach userId={user.id} profile={profile} place={state.place} runs={runs} detailed />
    </OnboardingFrame>
  );
}
