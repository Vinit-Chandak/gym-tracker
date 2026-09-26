import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { readTargets } from "@/server/repositories/nutrition";

import { TargetsForm } from "./targets-form";

export const metadata: Metadata = { title: "Targets" };

/**
 * The targets, on a screen of their own under Food (ADR 0035): the day's target, protein per
 * kilogram and fat's share, starting from the split the profile's training goal chooses.
 */
export default async function TargetsPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const targets = await withUser(getDb(), user.id, (tx) => readTargets(tx, user.id), {
    readOnly: true,
  });
  return (
    <>
      <PageHeader title="Targets" backHref="/food" />
      <PageContent>
        <TargetsForm
          targets={targets}
          bodyWeightKg={profile.bodyWeightKg}
          unit={profile.preferredUnit === "lb" ? "lb" : "kg"}
          goal={profile.trainingGoal}
        />
      </PageContent>
    </>
  );
}
