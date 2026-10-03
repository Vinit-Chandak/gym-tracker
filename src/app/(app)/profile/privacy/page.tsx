import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { listSportPreferences } from "@/server/repositories/sport-preferences";

import { PrivacyListRow } from "./privacy-list";
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
 * Privacy (plan §3.7): the switches, and the promise in plain words behind them, because a
 * privacy screen that does not say what it protects is decoration.
 */
export default async function PrivacyPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const sports = await withUser(getDb(), user.id, (tx) => listSportPreferences(tx, user.id), {
    readOnly: true,
  });

  // Board Privacy: the switches that keep the promise first, each saying what Off (or On)
  // means; then the promise itself, in full, behind two rows.
  return (
    <>
      <PageHeader title="Privacy" backHref="/profile" />
      <div className="page-width pb-8">
        <div className="mt-2">
          <PrivacySwitches
            values={{
              followApproval: profile.followApproval,
              shareTraining: profile.shareTraining,
              shareBodyWeight: profile.shareBodyWeight,
              discoverableByEmail: profile.discoverableByEmail,
            }}
          />
        </div>
        <div className="mt-3.5">
          <SportSharingSwitches
            values={{
              cycling: sports.find((sport) => sport.sport === "cycling")!.shareStats,
              swimming: sports.find((sport) => sport.sport === "swimming")!.shareStats,
            }}
          />
        </div>
        <ul className="mt-1.5">
          <PrivacyListRow glyph="people" title="What a follower can see" lines={VISIBLE} />
          <PrivacyListRow glyph="lock" title="What nobody can see" lines={NEVER} />
        </ul>
      </div>
    </>
  );
}
