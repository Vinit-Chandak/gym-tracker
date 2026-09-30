import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Disclosure } from "@/components/ui/disclosure";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { listSportPreferences } from "@/server/repositories/sport-preferences";

import { PrivacySwitches, SportSharingSwitches } from "./privacy-switches";

export const metadata: Metadata = { title: "Privacy" };

/** What a follower can see, and what nobody can (ADR 0026). The same two lists as the ADR. */
const VISIBLE = [
  "Your name, username, join month, and follower and following counts.",
  "Per finished workout: date, the day's name, duration, working sets, volume, sets per muscle group, records set.",
  "Per exercise from the shared library: working sets, reps, top weight, best estimated 1RM, best set volume, most reps, longest hold, longest carry.",
  "Per run: date, distance, duration, pace.",
  "Per ride or swim, if you enable sharing for that sport: date, duration and distance when known.",
  "Your latest body weight, only if you both switch that on.",
];
const NEVER = [
  "Notes on activities or sets, and substitution reasons.",
  "Check-ins and recovery: sleep, energy, fatigue and soreness.",
  "Gyms, machines and addresses, or which machine a set was on.",
  "Programmes, prescriptions and anything the coach wrote.",
  "Exercises you created yourself.",
  "Your email address, height, date of birth, sex and training goal.",
];

/**
 * Privacy (plan §3.7): the switches, then the promise they keep in plain words, because a
 * privacy screen that does not say what it protects is decoration. The promise is folded
 * into its two lists so the switches are the first thing on the screen.
 */
export default async function PrivacyPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const sports = await withUser(getDb(), user.id, (tx) => listSportPreferences(tx, user.id), {
    readOnly: true,
  });

  return (
    <>
      <PageHeader title="Privacy" backHref="/profile" />
      <PageContent>
        <Section title="Sharing">
          <PrivacySwitches
            values={{
              followApproval: profile.followApproval,
              shareTraining: profile.shareTraining,
              shareBodyWeight: profile.shareBodyWeight,
              discoverableByEmail: profile.discoverableByEmail,
            }}
          />
        </Section>
        <Section
          title="Rides and swims"
          info="Each is shared only if you switch it on here, and only while Share training with followers is on."
        >
          <SportSharingSwitches
            values={{
              cycling: sports.find((sport) => sport.sport === "cycling")!.shareStats,
              swimming: sports.find((sport) => sport.sport === "swimming")!.shareStats,
            }}
          />
        </Section>
        {/* The promise, in the ADR's own two lists: one tap each, rather than a wall of
            bullets above the switches that keep it. */}
        <Section title="What is shared">
          <Disclosure summary="What a follower can see" meta={`${VISIBLE.length}`}>
            <ul className="list-disc space-y-1.5 pl-5 text-sm">
              {VISIBLE.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Disclosure>
          <Disclosure summary="What nobody can see" meta={`${NEVER.length}`}>
            <ul className="list-disc space-y-1.5 pl-5 text-sm">
              {NEVER.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Disclosure>
        </Section>
      </PageContent>
    </>
  );
}
