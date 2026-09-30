"use client";

import { MailCheck } from "@/components/ui/icons";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { requestPasswordResetAction, type PasswordResetState } from "@/server/actions/auth";

const INITIAL: PasswordResetState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, INITIAL);

  if (state.sent) {
    return (
      <div role="status" className="space-y-2">
        <p className="flex items-center gap-2 font-semibold text-success">
          <MailCheck className="shrink-0" aria-hidden />
          Check your inbox
        </p>
        <p className="text-sm text-ink-muted">
          If that address has an account, a reset link is on its way. The link works once and
          expires after an hour.
        </p>
      </div>
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
      <div className="pt-1">
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Sending…" : "Send reset link"}
        </Button>
      </div>
    </form>
  );
}
