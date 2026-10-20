"use client";

import { MailCheck } from "@/components/ui/icons";
import { startTransition, useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { requestPasswordResetAction, type PasswordResetState } from "@/server/actions/auth";

const INITIAL: PasswordResetState = {};

/**
 * The address to send a reset link to. A request that did not go through — the sign-in service
 * out of reach on a gym's connection — leaves the address in the field to send again, as the
 * sign-in form does: it is sent in a transition of its own rather than as the form's action,
 * which React follows by clearing the field. Without JavaScript it posts as it is.
 */
export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, INITIAL);

  if (state.sent) {
    return (
      <p role="status" className="flex items-start gap-2 text-sm text-ink-muted">
        <MailCheck className="mt-0.5 shrink-0 text-success" aria-hidden />
        If that address has an account, a reset link is on its way. The link works once and expires
        after an hour.
      </p>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="space-y-4"
    >
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
