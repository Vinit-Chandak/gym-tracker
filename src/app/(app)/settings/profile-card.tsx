"use client";

import { useActionState } from "react";

import { ProfileFields, type ProfileFieldValues } from "@/components/profile-fields";
import { Card } from "@/components/ui/card";
import { FormError, SubmitButton } from "@/components/ui/form";
import { saveProfileAction } from "@/server/actions/profile";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

export function ProfileCard({ email, values }: { email: string; values: ProfileFieldValues }) {
  const [state, formAction] = useActionState(saveProfileAction, INITIAL_FORM_STATE);
  const saved =
    state.fieldErrors === undefined && state.formError === undefined && state.values === undefined;

  return (
    <Card>
      <div>
        <h2 className="text-base font-semibold">You</h2>
        <p className="text-sm break-words text-ink-muted">{email}</p>
      </div>
      <form action={formAction} className="space-y-4">
        <ProfileFields values={values} errors={state.fieldErrors} />
        <FormError message={state.formError} />
        <SubmitButton variant="secondary" pendingLabel="Saving…">
          Save
        </SubmitButton>
        <p className="sr-only" role="status">
          {saved ? "Profile saved" : ""}
        </p>
      </form>
    </Card>
  );
}
