"use client";

import { CheckCircle2 } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { updatePasswordAction, type PasswordChangeState } from "@/server/actions/auth";

const INITIAL: PasswordChangeState = {};

export function PasswordSettings() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(updatePasswordAction, INITIAL);

  return (
    <div className="min-w-0 space-y-3">
      {state.done ? (
        <p className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="size-5 shrink-0" aria-hidden />
          Password updated.
        </p>
      ) : open ? (
        <form action={formAction} className="space-y-4">
          <Field label="New password" hint="At least 8 characters.">
            <Input
              type="password"
              name="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
          <Field label="Confirm new password">
            <Input
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
          <FormError message={state.error} />
          <SubmitButton variant="secondary" pendingLabel="Saving…">
            Save password
          </SubmitButton>
        </form>
      ) : (
        <>
          <p className="text-sm text-ink-muted">
            Change the password you sign in with. You stay signed in on this device.
          </p>
          <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
            Change password
          </Button>
        </>
      )}
    </div>
  );
}
