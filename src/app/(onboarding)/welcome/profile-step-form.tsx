"use client";

import { useActionState, useState } from "react";

import { type ProfileFieldValues } from "@/components/profile-fields";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { UsernameField } from "@/components/username-field";
import type { BodyLoadUnit } from "@/domain/types";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { saveOnboardingProfileAction } from "@/server/actions/profile";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

const UNIT_OPTIONS = [
  { value: "kg", label: "kg (kilograms)" },
  { value: "lb", label: "lb (pounds)" },
] as const satisfies readonly { value: BodyLoadUnit; label: string }[];

function asUnit(value: string | undefined, fallback: BodyLoadUnit): BodyLoadUnit {
  return value === "kg" || value === "lb" ? value : fallback;
}

/** The first step's form: name, handle, units and time zone, then the one highlighter. */
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
      {/* Two choices, so two cells on a track rather than a picker: the chosen one is marked. */}
      <Field group label="Weight units">
        <SegmentedControl
          name="preferredUnit"
          columns={2}
          options={UNIT_OPTIONS}
          defaultValue={asUnit(state.values?.preferredUnit, values.preferredUnit)}
        />
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
