import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { APP_NAME } from "@/lib/app";
import { requireUser } from "@/server/auth";
import { ensureProfile } from "@/server/queries/profile";

import { ProfileStepForm } from "./profile-step-form";
import { Steps } from "./steps";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const user = await requireUser();
  const profile = await withUser(getDb(), user.id, (tx) => ensureProfile(tx, user));

  return (
    <PageContent>
      <Steps current="profile" />
      <Card>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Welcome to {APP_NAME}</h1>
          <p className="text-sm text-ink-muted">
            Four short steps and you can train. Everything here is editable later in Settings.
          </p>
        </div>
        <ProfileStepForm
          displayName={profile.displayName ?? ""}
          timeZone={profile.timeZone}
          preferredUnit={profile.preferredUnit === "lb" ? "lb" : "kg"}
          bodyWeightKg={profile.bodyWeightKg}
        />
      </Card>
    </PageContent>
  );
}
