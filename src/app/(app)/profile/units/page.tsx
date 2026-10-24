import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { resolveSportUnits } from "@/lib/distance-units";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { enabledSportsFor } from "@/server/repositories/sport-preferences";

import { UnitsForm } from "./units-form";

export const metadata: Metadata = { title: "Units and time zone" };

/** Profile › Preferences › Units and time zone: how the account measures, and its zone. */
export default async function UnitsPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const distances = resolveSportUnits(profile.preferredUnit, profile);
  const swims = await withUser(
    getDb(),
    user.id,
    async (tx) => (await enabledSportsFor(tx, user.id)).includes("swimming"),
    { readOnly: true },
  );

  return (
    <>
      <PageHeader title="Units and time zone" backHref="/profile" />
      <div className="page-width pb-8">
        <UnitsForm
          values={{
            timeZone: profile.timeZone,
            preferredUnit: profile.preferredUnit === "lb" ? "lb" : "kg",
            distanceUnit: distances.distanceUnit,
            poolUnit: distances.poolUnit,
            swims,
          }}
        />
      </div>
    </>
  );
}
