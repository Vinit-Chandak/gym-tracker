"use client";

import { useActionState, useState } from "react";

import { type ProfileFieldValues } from "@/components/profile-fields";
import { Field, Input, INPUT_CLASS } from "@/components/ui/input";
import { FormError, SubmitButton } from "@/components/ui/form";
import { UsernameField } from "@/components/username-field";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { saveOnboardingProfileAction } from "@/server/actions/profile";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

export function ProfileStepForm(values: ProfileFieldValues) {
  const [state, formAction] = useActionState(
    keepsFormOnDisconnect(saveOnboardingProfileAction),
    INITIAL_FORM_STATE,
  );
  const [zone] = useState(() =>
    typeof window === "undefined"
      ? values.timeZone
      : Intl.DateTimeFormat().resolvedOptions().timeZone,
  );

  return (
    <form action={formAction} className="space-y-4">
      <Field
        label="What should we call you?"
        hint="Optional. Your signup name is already filled in."
      >
        <Input
          name="displayName"
          defaultValue={state.values?.displayName ?? values.displayName}
          maxLength={80}
          autoComplete="given-name"
        />
      </Field>
      {/* The account already has one, chosen at signup or made from the email; this is where a
          made-up one gets corrected before anyone else sees it. */}
      <UsernameField
        defaultValue={state.values?.username ?? values.username}
        current={values.username}
        error={state.fieldErrors?.username}
        hint="What friends will find you by. You can change it later from your profile."
      />
      <Field label="Weight units">
        <select
          name="preferredUnit"
          className={INPUT_CLASS}
          defaultValue={state.values?.preferredUnit ?? values.preferredUnit}
        >
          <option value="kg">kg (kilograms)</option>
          <option value="lb">lb (pounds)</option>
        </select>
      </Field>
      <Field label="Time zone" error={state.fieldErrors?.timeZone}>
        <Input name="timeZone" defaultValue={state.values?.timeZone ?? zone} required />
      </Field>
      <p className="text-sm text-ink-muted">
        Body measurements and training goals are optional coaching details. You can add them when
        you create a programme.
      </p>
      <FormError message={state.formError} />
      <SubmitButton pendingLabel="Saving…">Continue</SubmitButton>
    </form>
  );
}
