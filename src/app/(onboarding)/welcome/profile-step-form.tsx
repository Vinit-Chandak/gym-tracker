"use client";

import { useActionState } from "react";

import { ProfileFields, type ProfileFieldValues } from "@/components/profile-fields";
import { FormError, SubmitButton } from "@/components/ui/form";
import { saveOnboardingProfileAction } from "@/server/actions/profile";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

export function ProfileStepForm(values: ProfileFieldValues) {
  const [state, formAction] = useActionState(saveOnboardingProfileAction, INITIAL_FORM_STATE);

  return (
    <form action={formAction} className="space-y-4">
      <ProfileFields values={values} errors={state.fieldErrors} detectTimeZone />
      <FormError message={state.formError} />
      <SubmitButton pendingLabel="Saving…">Continue</SubmitButton>
    </form>
  );
}
