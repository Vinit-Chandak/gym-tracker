"use client";

import { CheckCircle2 } from "lucide-react";
import { useActionState } from "react";

import { LinkButton, Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { updatePasswordAction, type PasswordChangeState } from "@/server/actions/auth";

const INITIAL: PasswordChangeState = {};

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(updatePasswordAction, INITIAL);

  if (state.done) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-medium text-success">
          <CheckCircle2 className="size-5 shrink-0" aria-hidden />
          Password updated
        </p>
        <LinkButton href="/today" size="lg" className="w-full">
          Go to Today
        </LinkButton>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <Field label="New password" hint="At least 8 characters.">
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
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
