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

  if (state.done) {
    return (
      <p className="flex items-center gap-2 text-sm text-success">
        <CheckCircle2 className="size-5 shrink-0" aria-hidden />
        Password updated.
      </p>
    );
  }

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">Password</p>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Change
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <Field label="New password" hint="At least 8 characters">
        <Input type="password" name="password" autoComplete="new-password" minLength={8} required />
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
      <div className="action-row">
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <SubmitButton variant="secondary" size="md" pendingLabel="Saving…">
          Save password
        </SubmitButton>
      </div>
    </form>
  );
}
