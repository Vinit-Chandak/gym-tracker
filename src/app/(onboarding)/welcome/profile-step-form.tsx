"use client";

import { useActionState, useState } from "react";

import { type ProfileFieldValues } from "@/components/profile-fields";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { UsernameField } from "@/components/username-field";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { saveOnboardingProfileAction } from "@/server/actions/profile";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

const UNITS = [
  { value: "kg", label: "kg" },
  { value: "lb", label: "lb" },
];

/** Board Welcome: the name, the username, then the units and the time zone side by side. */
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
    <form action={formAction} className="mt-4 space-y-3.5">
      <Field label="What should we call you?" aside="Optional">
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
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] items-end gap-3">
        <Field group label="Weight units">
          <SegmentedControl
            name="preferredUnit"
            aria-label="Weight units"
            options={UNITS}
            defaultValue={state.values?.preferredUnit ?? values.preferredUnit}
            columns={2}
          />
        </Field>
        <Field label="Time zone" error={state.fieldErrors?.timeZone}>
          <Input name="timeZone" defaultValue={state.values?.timeZone ?? zone} required />
        </Field>
      </div>
      <PinnedActions stack>
        <FormError message={state.formError} />
        <SubmitButton pendingLabel="Saving…">Continue</SubmitButton>
      </PinnedActions>
    </form>
  );
}
