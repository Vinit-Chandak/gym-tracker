import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { Glyph } from "@/components/ui/glyphs";
import { requireUser } from "@/server/auth";
import { listSentence, missingProfileDetails } from "@/server/queries/profile";
import { getRequestProfile } from "@/server/queries/request-profile";

import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Edit profile" };

export default async function EditProfilePage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const email = profile.email ?? user.email ?? "—";
  const unit = profile.preferredUnit === "lb" ? "lb" : "kg";
  const missing = missingProfileDetails(profile);

  return (
    <>
      <PageHeader title="Edit profile" backHref="/profile" />
      <div className="page-width pb-8">
        {/* The email is the account's identity and cannot be edited here, so it is a fact
            rather than a field. */}
        <dl className="profile-email">
          <dt className="font-bold">Email</dt>
          <dd className="min-w-0 text-right [overflow-wrap:anywhere] text-ink-2">{email}</dd>
        </dl>
        {/* Accounts that predate a question are not sent back through setup; this is where
            they answer it, so the screen says which questions are still open. */}
        {missing.length > 0 && (
          <p role="status" className="profile-still-to-add">
            <Glyph name="warn" className="mt-px glyph-18 shrink-0" />
            <span className="min-w-0">
              Still to add: {listSentence(missing)}. Saving needs all of them.
            </span>
          </p>
        )}
        <div className="mt-3.5">
          <ProfileForm
            values={{
              displayName: profile.displayName ?? "",
              username: profile.username,
              timeZone: profile.timeZone,
              preferredUnit: unit,
              bodyWeightKg: profile.bodyWeightKg,
              heightCm: profile.heightCm,
              dateOfBirth: profile.dateOfBirth,
              sex: profile.sex,
              trainingGoal: profile.trainingGoal,
            }}
          />
        </div>
      </div>
    </>
  );
}
