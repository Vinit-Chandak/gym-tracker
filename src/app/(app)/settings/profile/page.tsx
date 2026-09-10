import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { List, Row } from "@/components/ui/link-row";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";

import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const email = profile.email ?? user.email ?? "—";

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
        </List>
        <Card>
          <ProfileForm
            values={{
              displayName: profile.displayName ?? "",
              timeZone: profile.timeZone,
              preferredUnit: profile.preferredUnit === "lb" ? "lb" : "kg",
              bodyWeightKg: profile.bodyWeightKg,
            }}
          />
        </Card>
      </PageContent>
    </>
  );
}
