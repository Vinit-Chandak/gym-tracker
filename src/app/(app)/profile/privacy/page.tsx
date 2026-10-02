import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
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

/** One list of the promise, ruled line by line. */
function Promise({ lines }: { lines: readonly string[] }) {
  return (
    <Card className="space-y-0 py-0">
      <ul className="ruled-list">
        {lines.map((line) => (
          <li key={line} className="py-2.5 text-sm [overflow-wrap:anywhere]">
            {line}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * Privacy (plan §3.7): the promise in plain words above the switches that keep it, because a
 * privacy screen that does not say what it protects is decoration.
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
        {/* The promise first, as two ruled lists, then the switches that keep it. */}
        <Section title="What a follower can see">
          <Promise lines={VISIBLE} />
        </Section>
        <Section title="What nobody can see">
          <Promise lines={NEVER} />
        </Section>
        <PrivacySwitches
          values={{
            followApproval: profile.followApproval,
            shareTraining: profile.shareTraining,
            shareBodyWeight: profile.shareBodyWeight,
            discoverableByEmail: profile.discoverableByEmail,
          }}
        />
        <SportSharingSwitches
          values={{
            cycling: sports.find((sport) => sport.sport === "cycling")!.shareStats,
            swimming: sports.find((sport) => sport.sport === "swimming")!.shareStats,
          }}
        />
      </PageContent>
    </>
  );
}
