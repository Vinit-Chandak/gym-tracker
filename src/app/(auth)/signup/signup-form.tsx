"use client";

import { MailCheck } from "@/components/ui/icons";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import Link from "@/components/ui/app-link";
import { Field, Input } from "@/components/ui/input";
import { signUpAction, type SignUpState } from "@/server/actions/auth";

const INITIAL: SignUpState = {};

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUpAction, INITIAL);
  // What they typed survives a refused attempt, as it does on the sign-in form. Only the
  // passwords are asked for again, which is the one pair worth retyping.
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");

  if (state.checkEmail) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-medium text-success">
          <MailCheck className="shrink-0" aria-hidden />
          Check your inbox
        </p>
        <p className="text-sm text-ink-muted">
          A confirmation link was requested for <span className="text-ink">{state.checkEmail}</span>
          . Check your inbox and spam folder. Open the link to finish setting up your account.
        </p>
        <p className="text-sm text-ink-muted">
          Already registered?{" "}
          <Link href="/login" className="text-accent underline">
            Sign in
          </Link>{" "}
          or{" "}
          <Link href="/forgot-password" className="text-accent underline">
            reset your password
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Name">
        <Input
          type="text"
          name="displayName"
          autoComplete="name"
          maxLength={80}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </Field>
      <Field label="Email">
        <Input
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
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
