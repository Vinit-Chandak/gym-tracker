"use client";

import { CheckCircle2 } from "@/components/ui/icons";
import { useActionState } from "react";

import { LinkButton } from "@/components/ui/button";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { updatePasswordAction, type PasswordChangeState } from "@/server/actions/auth";

const INITIAL: PasswordChangeState = {};

export function PasswordForm() {
  const [state, formAction] = useActionState(updatePasswordAction, INITIAL);

  if (state.done) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="shrink-0" aria-hidden />
          Password updated.
        </p>
        <LinkButton href="/settings" variant="secondary" className="w-full">
          Back to Settings
        </LinkButton>
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
      <SubmitButton pendingLabel="Saving…">Save password</SubmitButton>
    </form>
  );
}
