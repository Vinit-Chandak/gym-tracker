"use client";

import { useActionState } from "react";

import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { deleteAccountAction, type DeleteAccountState } from "@/server/actions/account";

const INITIAL: DeleteAccountState = {};

export function DeleteAccountForm() {
  const [state, formAction] = useActionState(deleteAccountAction, INITIAL);

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Type DELETE to confirm">
        <Input
          name="confirm"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          required
        />
      </Field>
      <FormError message={state.error} />
      <SubmitButton variant="danger" pendingLabel="Deleting…">
        Delete everything
      </SubmitButton>
    </form>
  );
}
