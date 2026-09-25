import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { Card } from "@/components/ui/card";
import { APP_NAME } from "@/lib/app";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";

import { ProfileStepForm } from "./profile-step-form";
import { Steps } from "./steps";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const user = await requireUser();
  // The cached read: it writes only for a missing profile, where this used to lock every visit.
  const profile = await getRequestProfile(user.id, user.email, user.displayName);

  return (
    <PageContent>
      <Steps current="profile" />
      <Card>
        <div>
          <h1 className="text-xl font-medium">Welcome to {APP_NAME}</h1>
          <p className="text-sm text-ink-muted">
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
  );
}
