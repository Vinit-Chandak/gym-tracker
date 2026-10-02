import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { Wordmark } from "@/components/shell/wordmark";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";

import { ProfileStepForm } from "./profile-step-form";
import { StepHeader, Steps } from "./steps";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const user = await requireUser();
  // The cached read: it writes only for a missing profile, where this used to lock every visit.
  const profile = await getRequestProfile(user.id, user.email, user.displayName);

  return (
    <>
      <StepHeader current="profile" />
      <PageContent>
        <Steps current="profile" />
        <Card>
          <div>
            <h2 className="text-2xl">
              Welcome to <Wordmark />
            </h2>
            <p className="mt-1 text-ink-muted">
              A few short steps. Everything here can be changed later, from your profile.
            </p>
          </div>
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
        </Card>
      </PageContent>
    </>
  );
}
