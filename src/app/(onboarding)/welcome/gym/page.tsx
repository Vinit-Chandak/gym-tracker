import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireProfiledUser } from "@/server/auth";
import { listGyms } from "@/server/repositories/gyms";

import { Steps } from "../steps";
import { SkipLink } from "../skip-link";
import { FirstGymForm } from "./first-gym-form";

export const metadata: Metadata = { title: "Add your gym" };

export default async function WelcomeGymPage() {
  const user = await requireProfiledUser();
  const gyms = await withUser(getDb(), user.id, (tx) => listGyms(tx, user.id), { readOnly: true });

  return (
    <PageContent>
      <Steps current="gym" />
      {/* Someone coming back to a setup they left needs to see what they already added.
          Without this the step reads as though nothing had been saved, and adding the same
          gym again made a second one with the same name. */}
      {gyms.length > 0 && (
        <Card>
          <h2 className="font-medium">Already added</h2>
          <ul className="space-y-1 text-sm text-ink-muted">
            {gyms.map((gym) => (
              <li key={gym.id}>
                {gym.name}
                {gym.equipmentCount > 0 ? ` · ${gym.equipmentCount} machines` : ""}
              </li>
            ))}
          </ul>
          <LinkButton
            href={`/welcome/equipment?gym=${gyms.find((gym) => gym.isDefault)?.id ?? gyms[0]!.id}`}
          >
            Continue
          </LinkButton>
        </Card>
      )}
      <Card>
        <h1 className="text-xl font-medium">
          {gyms.length > 0 ? "Add another place you train" : "Where do you train?"}
        </h1>
        <FirstGymForm />
      </Card>
      <SkipLink href="/welcome/programme" />
    </PageContent>
  );
}
