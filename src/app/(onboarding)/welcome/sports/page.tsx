import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SportChoice } from "@/components/activities/sport-choice";
import { PageContent } from "@/components/shell/page-content";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { enabledSports, multisportRollout } from "@/lib/multisport-rollout";
import { chooseSportsAction } from "@/server/actions/sport-preferences";
import { requireUser } from "@/server/auth";
import { enabledSportsFor } from "@/server/repositories/sport-preferences";

import { Steps } from "../steps";

export const metadata: Metadata = { title: "Your sports" };

/**
 * The second step of setup (ONBOARD-01, SCOPE-02).
 *
 * What you train decides what the rest of setup asks about. Choose lifting and the gym and
 * machine steps follow; choose only swimming and they do not, because a swimmer has no reason
 * to invent a gym to get through a form.
 */
export default async function SportsStepPage() {
  const rollout = multisportRollout();
  if (!rollout.sharedNavigation) redirect("/welcome/gym");
  const user = await requireUser();
  const enabled = await withUser(getDb(), user.id, (tx) => enabledSportsFor(tx, user.id), {
    readOnly: true,
  });

  return (
    <PageContent>
      <Steps current="sports" />
      <Card>
        <div>
          <h1 className="text-xl font-medium">What do you train?</h1>
          <p className="text-sm text-ink-muted">
            Pick everything that applies. You can change this whenever you like.
          </p>
        </div>
        <SportChoice
          action={chooseSportsAction}
          sports={enabledSports(rollout)}
          enabled={enabled}
          submitLabel="Continue"
          note="Only lifting needs a gym set up. The rest you can start logging straight away."
        />
      </Card>
    </PageContent>
  );
}
