"use client";

import { MailCheck } from "@/components/ui/icons";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { signUpAction, type SignUpState } from "@/server/actions/auth";

const INITIAL: SignUpState = {};

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUpAction, INITIAL);

  if (state.checkEmail) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-medium text-success">
          <MailCheck className="shrink-0" aria-hidden />
          Check your inbox
        </p>
        <p className="text-sm text-ink-muted">
          We sent a confirmation link to <span className="text-ink">{state.checkEmail}</span>. Open
          it on this device to finish setting up your account.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Name">
        <Input type="text" name="displayName" autoComplete="name" maxLength={80} />
      </Field>
      <Field label="Email">
        <Input type="email" name="email" autoComplete="email" inputMode="email" required />
      </Field>
      <Field label="Password" hint="At least 8 characters">
        <Input type="password" name="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="Confirm password">
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
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
