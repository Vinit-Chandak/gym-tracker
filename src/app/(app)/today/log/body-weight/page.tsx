import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { latestBodyWeight } from "@/server/repositories/body-weight";

import { BodyWeightForm } from "./body-weight-form";

export const metadata: Metadata = { title: "Log body weight" };

/**
 * Today › Log › Body weight (IA audit M8): a reading for any day up to today, in the account's
 * unit, written as a workout's Finish writes one. Logging is Today's (ADR 0058); Progress › Body
 * weight draws the readings.
 */
export default async function LogBodyWeightPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const last = await withUser(getDb(), user.id, (tx) => latestBodyWeight(tx, user.id), {
    readOnly: true,
  });

  return (
    <>
      <PageHeader title="Log body weight" backHref="/today/log" />
      <PageContent>
        <BodyWeightForm
          today={todayInTimeZone(profile.timeZone)}
          unit={profile.preferredUnit === "lb" ? "lb" : "kg"}
          last={last}
        />
      </PageContent>
    </>
  );
}
