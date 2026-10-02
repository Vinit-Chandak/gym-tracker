import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireProfiledUser } from "@/server/auth";
import { listGyms } from "@/server/repositories/gyms";

import { SkipLink } from "../skip-link";
import { StepHeader, Steps } from "../steps";
import { FirstGymForm } from "./first-gym-form";

export const metadata: Metadata = { title: "Add your gym" };

export default async function WelcomeGymPage() {
  const user = await requireProfiledUser();
  const gyms = await withUser(getDb(), user.id, (tx) => listGyms(tx, user.id), { readOnly: true });
  // With a gym already added, carrying on with it is the step's action and takes the
  // highlighter; adding another is still here, ruled.
  const added = gyms.length > 0;

  return (
    <>
      <StepHeader current="gym" />
      <PageContent>
        <Steps current="gym" />
        {/* Someone coming back to a setup they left needs to see what they already added.
            Without this the step reads as though nothing had been saved, and adding the same
            gym again made a second one with the same name. */}
        {added && (
          <Card>
            <h2 className="text-2xl">Already added</h2>
            <ul className="ruled-list">
              {gyms.map((gym) => (
                <li
                  key={gym.id}
                  className="flex items-baseline justify-between gap-3 py-2 [overflow-wrap:anywhere]"
                >
                  <span className="min-w-0 font-medium">{gym.name}</span>
                  {gym.equipmentCount > 0 && (
                    <span className="shrink-0 font-data text-sm text-ink-muted tabular-nums">
                      {gym.equipmentCount} machines
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <LinkButton
              href={`/welcome/equipment?gym=${gyms.find((gym) => gym.isDefault)?.id ?? gyms[0]!.id}`}
              size="lg"
              className="w-full"
            >
              Continue
            </LinkButton>
          </Card>
        )}
        <Card>
          <h2 className={added ? "text-lg" : "text-2xl"}>
            {added ? "Add another place you train" : "Where do you train?"}
          </h2>
          <FirstGymForm submitVariant={added ? "secondary" : "primary"} />
        </Card>
        <SkipLink href="/welcome/programme" />
      </PageContent>
    </>
  );
}
