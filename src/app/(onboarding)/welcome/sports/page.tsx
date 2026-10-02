import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORTS } from "@/domain/activity";
import { requireUser } from "@/server/auth";
import { enabledSportsFor } from "@/server/repositories/sport-preferences";

import { StepHeader, Steps } from "../steps";
import { SportsStepForm } from "./sports-step-form";

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
    <>
      <StepHeader current="sports" />
      <PageContent>
        <Steps current="sports" />
        <Card>
          <div>
            <h2 className="text-2xl">What do you train?</h2>
            <p className="mt-1 text-ink-muted">
              Pick everything that applies. You can change this whenever you like.
            </p>
          </div>
          <SportsStepForm
            sports={ACTIVITY_SPORTS}
            enabled={enabled}
            note="Only lifting needs a gym set up. The rest you can start logging straight away."
          />
        </Card>
      </PageContent>
    </>
  );
}
