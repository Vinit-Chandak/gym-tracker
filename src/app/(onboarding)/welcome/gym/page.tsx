import type { Metadata } from "next";

import { LinkButton } from "@/components/ui/button";
import { Glyph, gymKindGlyph } from "@/components/ui/glyphs";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireProfiledUser } from "@/server/auth";
import { listGyms } from "@/server/repositories/gyms";

import { OnboardingFrame } from "../onboarding-frame";
import { FirstGymForm } from "./first-gym-form";

export const metadata: Metadata = { title: "Add your gym" };

export default async function WelcomeGymPage() {
  const user = await requireProfiledUser();
  const gyms = await withUser(getDb(), user.id, (tx) => listGyms(tx, user.id), { readOnly: true });

  // Board Gym step. Someone coming back to a setup they left sees what they already added:
  // without it the step read as though nothing had been saved, and adding the same gym again
  // made a second one with the same name.
  return (
    <OnboardingFrame
      step="gym"
      back="/welcome/sports"
      title={gyms.length > 0 ? "Add another place you train" : "Where do you train?"}
    >
      {gyms.length > 0 && (
        <section aria-labelledby="gym-step-added">
          <h2 id="gym-step-added" className="caption-head mt-3">
            Already added
          </h2>
          <ul>
            {gyms.map((gym) => (
              <li key={gym.id} className="flex min-h-11 items-center gap-3 border-b border-hair">
                <span className="mark-cell">
                  <Glyph name={gymKindGlyph(gym.kind)} className="glyph-20" />
                </span>
                <span className="min-w-0 type-meta font-semibold [overflow-wrap:anywhere]">
                  {gym.name}
                  {gym.equipmentCount > 0 ? ` · ${gym.equipmentCount} machines` : ""}
                </span>
              </li>
            ))}
          </ul>
          <LinkButton
            href={`/welcome/equipment?gym=${gyms.find((gym) => gym.isDefault)?.id ?? gyms[0]!.id}`}
            variant="secondary"
            className="mt-3 w-full"
          >
            Continue
          </LinkButton>
        </section>
      )}
      <FirstGymForm />
    </OnboardingFrame>
  );
}
