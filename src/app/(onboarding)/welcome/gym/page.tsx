import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { LinkButton } from "@/components/ui/button";
import { MapPin } from "@/components/ui/icons";
import { List, Row } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireProfiledUser } from "@/server/auth";
import { listGyms } from "@/server/repositories/gyms";

import { StepHeading, Steps } from "../steps";
import { SkipLink } from "../skip-link";
import { FirstGymForm } from "./first-gym-form";

export const metadata: Metadata = { title: "Add your gym" };

export default async function WelcomeGymPage() {
  const user = await requireProfiledUser();
  const gyms = await withUser(getDb(), user.id, (tx) => listGyms(tx, user.id), { readOnly: true });
  const added = gyms.length > 0;

  return (
    <PageContent className="pt-6">
      <Steps current="gym" />
      <StepHeading title="Where do you train?">
        {added ? "Carry on, or add another place." : "Somewhere you lift: a gym, home or outdoors."}
      </StepHeading>
      {/* Someone coming back to a setup they left needs to see what they already added.
          Without this the step reads as though nothing had been saved, and adding the same
          gym again made a second one with the same name. */}
      {added && (
        <Section title="Already added">
          <List>
            {gyms.map((gym) => (
              <li key={gym.id}>
                <Row
                  icon={MapPin}
                  title={gym.name}
                  subtitle={
                    gym.equipmentCount > 0
                      ? `${gym.equipmentCount} ${gym.equipmentCount === 1 ? "machine" : "machines"}`
                      : undefined
                  }
                />
              </li>
            ))}
          </List>
          <LinkButton
            href={`/welcome/equipment?gym=${gyms.find((gym) => gym.isDefault)?.id ?? gyms[0]!.id}`}
            size="lg"
            className="w-full"
          >
            Continue
          </LinkButton>
        </Section>
      )}
      {added ? (
        <Section title="Add another place">
          <FirstGymForm secondary />
        </Section>
      ) : (
        <FirstGymForm />
      )}
      <SkipLink href="/welcome/programme" />
    </PageContent>
  );
}
