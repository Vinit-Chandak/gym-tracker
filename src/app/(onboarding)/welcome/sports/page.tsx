import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORTS } from "@/domain/activity";
import { chooseSportsAction } from "@/server/actions/sport-preferences";
import { requireUser } from "@/server/auth";
import { enabledSportsFor } from "@/server/repositories/sport-preferences";

import { StepHeading, Steps } from "../steps";
import { SportPicker } from "./sport-picker";

export const metadata: Metadata = { title: "Your sports" };

/**
 * The second step of setup (ONBOARD-01, SCOPE-02).
 *
 * What you train decides what the rest of setup asks about. Choose lifting and the gym and
 * machine steps follow; choose only swimming and they do not, because a swimmer has no reason
 * to invent a gym to get through a form.
 */
export default async function SportsStepPage() {
  const user = await requireUser();
  const enabled = await withUser(getDb(), user.id, (tx) => enabledSportsFor(tx, user.id), {
    readOnly: true,
  });

  return (
    <PageContent className="pt-6">
      <Steps current="sports" />
      <StepHeading
        title="What do you train?"
        infoLabel="About sports"
        info="Only lifting needs a gym set up; the rest you can start logging straight away. You can change your sports whenever you like, from your profile."
      >
        Pick all that apply.
      </StepHeading>
      <SportPicker action={chooseSportsAction} sports={ACTIVITY_SPORTS} enabled={enabled} />
    </PageContent>
  );
}
