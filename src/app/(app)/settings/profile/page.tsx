import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { List, Row } from "@/components/ui/link-row";
import { formatHeight } from "@/lib/units";
import { requireUser } from "@/server/auth";
import { listSentence, missingProfileDetails } from "@/server/queries/profile";
import { getRequestProfile } from "@/server/queries/request-profile";

import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const email = profile.email ?? user.email ?? "—";
  const unit = profile.preferredUnit === "lb" ? "lb" : "kg";
  const missing = missingProfileDetails(profile);

  return (
    <>
      <PageHeader title="Profile" backHref="/settings" />
      <PageContent>
        {/* The email is the account's identity and cannot be edited here, so it is a row
            rather than a field. */}
        <List>
          <li>
            <Row title="Email" subtitle={email} />
          </li>
          {profile.heightCm !== null && (
            <li>
              <Row title="Height" subtitle={formatHeight(profile.heightCm, unit)} />
            </li>
          )}
        </List>
        {/* Accounts that predate a question are not sent back through setup; this is where
            they answer it, so the screen says which questions are still open. */}
        {missing.length > 0 && (
          <p role="status" className="text-sm text-warning">
            Still to add: {listSentence(missing)}. Saving needs all of them.
          </p>
        )}
        <Card>
          <ProfileForm
            values={{
              displayName: profile.displayName ?? "",
              timeZone: profile.timeZone,
              preferredUnit: unit,
              bodyWeightKg: profile.bodyWeightKg,
              heightCm: profile.heightCm,
              dateOfBirth: profile.dateOfBirth,
              sex: profile.sex,
              trainingGoal: profile.trainingGoal,
            }}
          />
        </Card>
      </PageContent>
    </>
  );
}
