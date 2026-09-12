"use client";

import { useActionState } from "react";

import { ProfileFields, type ProfileFieldValues } from "@/components/profile-fields";
import { FormError, SubmitButton } from "@/components/ui/form";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { saveProfileAction } from "@/server/actions/profile";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

export function ProfileForm({ values }: { values: ProfileFieldValues }) {
  const [state, formAction] = useActionState(
    keepsFormOnDisconnect(saveProfileAction),
    INITIAL_FORM_STATE,
  );
  const saved =
    state !== INITIAL_FORM_STATE &&
    state.fieldErrors === undefined &&
    state.formError === undefined &&
    state.values === undefined;

  return (
    <form action={formAction} onReset={(event) => event.preventDefault()} className="space-y-4">
      <ProfileFields values={values} errors={state.fieldErrors} />
      <FormError message={state.formError} />
      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
      <p className="sr-only" role="status">
        {saved ? "Profile saved" : ""}
      </p>
    </form>
  );
}
