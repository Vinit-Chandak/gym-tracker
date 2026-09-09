"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormError, SubmitButton } from "@/components/ui/form";
import { InfoTip } from "@/components/ui/info-tip";
import { Field, Input } from "@/components/ui/input";
import { deleteAccountAction, type DeleteAccountState } from "@/server/actions/account";

const INITIAL: DeleteAccountState = {};

export function DeleteAccountSettings({ removesSignIn }: { removesSignIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(deleteAccountAction, INITIAL);

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1 font-medium">
          Delete account
          <InfoTip label="About deleting the account">
            Permanently removes your gyms, machines, programmes, sessions, sets, runs and tokens.
            Nothing is exported first.
            {!removesSignIn &&
              " Your email and password stay with the sign-in provider; ask whoever runs it to remove the login itself."}
          </InfoTip>
        </p>
        {!open && (
          <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
            Delete…
          </Button>
        )}
      </div>
      {open && (
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
          <div className="action-row">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton variant="danger" size="md" pendingLabel="Deleting…">
              Delete everything
            </SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
