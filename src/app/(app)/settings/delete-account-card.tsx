"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { deleteAccountAction, type DeleteAccountState } from "@/server/actions/account";

const INITIAL: DeleteAccountState = {};

export function DeleteAccountCard({ removesSignIn }: { removesSignIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(deleteAccountAction, INITIAL);

  return (
    <Card variant="plain">
      <h2 className="text-base font-semibold text-danger">Delete account</h2>
      <p className="text-sm text-ink-muted">
        Permanently removes your gyms, machines, programmes, sessions, sets, runs and tokens. This
        cannot be undone and nothing is exported first.
      </p>
      {!removesSignIn && (
        <p className="text-sm text-ink-muted">
          Your email and password stay registered with the authentication provider, because this app
          deliberately holds no key that could delete them. Ask whoever runs the Supabase project to
          remove the login itself.
        </p>
      )}
      {open ? (
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
          <Button variant="ghost" className="w-full" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <Button variant="danger" className="w-full" onClick={() => setOpen(true)}>
          Delete my account
        </Button>
      )}
    </Card>
  );
}
