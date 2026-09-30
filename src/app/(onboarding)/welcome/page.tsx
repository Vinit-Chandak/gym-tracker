import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { Wordmark } from "@/components/shell/wordmark";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";

import { ProfileStepForm } from "./profile-step-form";
import { StepHeading, Steps } from "./steps";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const user = await requireUser();
  // The cached read: it writes only for a missing profile, where this used to lock every visit.
  const profile = await getRequestProfile(user.id, user.email, user.displayName);

  return (
    <PageContent className="pt-6">
      <Steps current="profile" />
      <StepHeading
        title={
          <>
            Welcome to <Wordmark />
          </>
        }
        infoLabel="About setting up"
        info="Everything here can be changed later, from your profile. Body measurements and training goals are optional coaching details: you can add them when you create a programme."
      >
        First, a little about you.
      </StepHeading>
      <ProfileStepForm
        displayName={profile.displayName ?? ""}
        username={profile.username}
        timeZone={profile.timeZone}
        preferredUnit={profile.preferredUnit === "lb" ? "lb" : "kg"}
        bodyWeightKg={profile.bodyWeightKg}
        heightCm={profile.heightCm}
        dateOfBirth={profile.dateOfBirth}
        sex={profile.sex}
        trainingGoal={profile.trainingGoal}
      />
    </PageContent>
  );
}
