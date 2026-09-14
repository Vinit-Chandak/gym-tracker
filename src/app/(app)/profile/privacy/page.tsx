import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";

import { PrivacySwitches } from "./privacy-switches";

export const metadata: Metadata = { title: "Privacy" };

/** What a follower can see, and what nobody can (ADR 0026). The same two lists as the ADR. */
const VISIBLE = [
  "Your name, username, join month, and follower and following counts.",
  "Per finished workout: date, the day's name, duration, working sets, volume, sets per muscle group, records set.",
  "Per exercise from the shared library: working sets, reps, top weight, best estimated 1RM, best set volume, most reps, longest hold, longest carry.",
  "Per run: date, distance, duration, pace.",
  "Your latest body weight, only if you both switch that on.",
];
const NEVER = [
  "Notes on sessions, sets or runs, and substitution reasons.",
  "Check-ins and recovery: sleep, energy, fatigue, soreness, back or shin pain.",
  "Gyms, machines and addresses, or which machine a set was on.",
  "Programmes, prescriptions and anything the coach wrote.",
  "Exercises you created yourself.",
  "Your email address, height, date of birth, sex and training goal.",
];

/**
 * Privacy (plan §3.7): the promise in plain words above the switches that keep it, because a
 * privacy screen that does not say what it protects is decoration.
 */
export default async function PrivacyPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);

  return (
    <>
      <PageHeader title="Privacy" backHref="/profile" />
      <PageContent>
        <Card>
          <div>
            <h2 className="font-medium">What a follower can see</h2>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-muted">
              {VISIBLE.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-medium">What nobody can see</h2>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-muted">
              {NEVER.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </Card>
        <PrivacySwitches
          values={{
            followApproval: profile.followApproval,
            shareTraining: profile.shareTraining,
            shareBodyWeight: profile.shareBodyWeight,
            discoverableByEmail: profile.discoverableByEmail,
          }}
        />
      </PageContent>
    </>
  );
}
