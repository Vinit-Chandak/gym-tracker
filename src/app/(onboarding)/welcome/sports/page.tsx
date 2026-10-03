import type { Metadata } from "next";

import { SportChoice } from "@/components/activities/sport-choice";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORTS } from "@/domain/activity";
import { chooseSportsAction } from "@/server/actions/sport-preferences";
import { requireUser } from "@/server/auth";
import { enabledSportsFor } from "@/server/repositories/sport-preferences";

import { OnboardingFrame } from "../onboarding-frame";

export const metadata: Metadata = { title: "Your sports" };

/**
 * The second step of setup (ONBOARD-01, SCOPE-02; board Sports).
 *
 * What you train decides what the rest of setup asks about. Choose lifting and the gym and
 * machine steps follow; choose only swimming and they do not, because a swimmer has no reason
 * to invent a gym to get through a form.
 */
export default async function SportsStepPage() {
  const user = await requireUser();
  const enabled = await withUser(getDb(), user.id, (tx) => enabledSportsFor(tx, user.id), {
    readOnly: true,
  });

  return (
    <OnboardingFrame
      step="sports"
      back="/welcome"
      title="What do you train?"
      sub="Pick everything that applies. You can change this whenever you like."
    >
      <SportChoice
        action={chooseSportsAction}
        sports={ACTIVITY_SPORTS}
        enabled={enabled}
        submitLabel="Continue"
        note="Only lifting needs a gym set up. The rest you can start logging straight away."
      />
    </OnboardingFrame>
  );
}
