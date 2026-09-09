"use client";

import { MailCheck } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { requestPasswordResetAction, type PasswordResetState } from "@/server/actions/auth";

const INITIAL: PasswordResetState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, INITIAL);

  if (state.sent) {
    return (
      <p className="flex items-start gap-2 text-sm text-ink-muted">
        <MailCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
        If that address has an account, a reset link is on its way. The link works once and expires
        after an hour.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Email">
        <Input type="email" name="email" autoComplete="email" inputMode="email" required />
      </Field>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
