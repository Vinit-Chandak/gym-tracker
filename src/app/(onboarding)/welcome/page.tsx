import type { Metadata } from "next";

import { Art } from "@/components/art/art";
import { APP_NAME } from "@/lib/app";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";

import { OnboardingFrame } from "./onboarding-frame";
import { ProfileStepForm } from "./profile-step-form";

export const metadata: Metadata = { title: "Welcome" };

/** The print's key, once: each form beside its sport. */
const KEY = [
  ["strength", "Lifting"],
  ["run", "Running"],
  ["ride", "Cycling"],
  ["swim", "Swimming"],
] as const;

/**
 * The first step (board Welcome): what the app draws, a print of lifting, a run, a ride and a
 * swim with its key under it; then who you are and how you measure.
 */
export default async function WelcomePage() {
  const user = await requireUser();
  // The cached read: it writes only for a missing profile, where this used to lock every visit.
  const profile = await getRequestProfile(user.id, user.email, user.displayName);

  return (
    <OnboardingFrame step="profile" title={null}>
      <figure className="welcome-print">
        <Art
          kind="print"
          label="A print: lifting, a run, a ride and a swim"
          parts={[
            {
              kind: "strength",
              columns: [
                { sets: 2, done: 2 },
                { sets: 3, done: 3 },
              ],
            },
            { kind: "run", state: "done" },
            { kind: "ride", state: "done" },
            { kind: "swim", state: "done" },
          ]}
          className="size-full"
        />
      </figure>
      <p className="welcome-key">
        {KEY.map(([sport, label]) => (
          <span key={sport} className="inline-flex items-center gap-1.5">
            <Art kind="mark" sport={sport} size={12} />
            {label}
          </span>
        ))}
      </p>
      <h1 className="onboarding-title">Welcome to {APP_NAME}</h1>
      <p className="onboarding-sub">
        A few short steps. Everything here can be changed later, from your profile.
      </p>
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
    </OnboardingFrame>
  );
}
