"use client";

import { useActionState, useState, type ChangeEvent } from "react";

import { ProfileFields, type ProfileFieldValues } from "@/components/profile-fields";
import { FormError, SubmitButton, useKeptForm } from "@/components/ui/form";
import { SavedNotice } from "@/components/ui/saved-notice";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { saveProfileAction } from "@/server/actions/profile";
import {
  formValues,
  INITIAL_FORM_STATE,
  parseForm,
  type FormState,
} from "@/server/validation/form";
import { profileInputSchema } from "@/server/validation/profile";

export function ProfileForm({ values }: { values: ProfileFieldValues }) {
  // React resets the form after its action with its own events switched off, so an onReset
  // handler never hears it; a listener on the form itself does, and keeps what was typed.
  const form = useKeptForm();
  const [state, formAction, pending] = useActionState(
    keepsFormOnDisconnect(saveProfileAction),
    INITIAL_FORM_STATE,
  );
  const [edited, setEdited] = useState<{ state: FormState; errors?: Record<string, string> }>();
  // Only a refused field is checked while typing. A new response always wins, including a
  // repeated username collision; correcting another answer never clears that refusal.
  function change(event: ChangeEvent<HTMLFormElement>) {
    if (!state.fieldErrors) {
      setEdited({ state });
      return;
    }
    const data = new FormData(event.currentTarget);
    const values = formValues(data);
    const checked = parseForm(profileInputSchema, data);
    const errors = { ...state.fieldErrors };
    for (const key of Object.keys(errors)) {
      const changed =
        values[key] !== state.values?.[key] ||
        (key === "heightFeet" && values.heightInches !== state.values?.heightInches);
      if (!changed) continue;
      const message = checked.success ? undefined : checked.state.fieldErrors?.[key];
      if (message) errors[key] = message;
      else delete errors[key];
    }
    if (!checked.success) Object.assign(errors, checked.state.fieldErrors);
    setEdited({ state, errors });
  }
  const saved =
    edited?.state !== state &&
    state !== INITIAL_FORM_STATE &&
    state.fieldErrors === undefined &&
    state.formError === undefined &&
    state.values === undefined;

  return (
    <form ref={form} action={formAction} onChange={change} className="space-y-4" noValidate>
      <fieldset disabled={pending} className="min-w-0 space-y-4">
        <ProfileFields
          values={values}
          errors={edited?.state === state ? edited.errors : state.fieldErrors}
        />
      </fieldset>
      <PinnedActions stack>
        <FormError message={state.formError} />
        {saved && !pending && <SavedNotice>Profile saved</SavedNotice>}
        <SubmitButton pendingLabel="Saving…">{state.formError ? "Retry" : "Save"}</SubmitButton>
      </PinnedActions>
    </form>
  );
}
