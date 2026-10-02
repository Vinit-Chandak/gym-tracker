"use client";

import { useActionState, useState } from "react";

import Link from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { MailCheck } from "@/components/ui/icons";
import { Field, Input } from "@/components/ui/input";
import { UsernameField } from "@/components/username-field";
import { signUpAction, type SignUpState } from "@/server/actions/auth";

const INITIAL: SignUpState = {};

/** A word that can be tapped inside running text: the pen, underlined. */
const INLINE_LINK = "font-medium text-pen underline underline-offset-4";

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUpAction, INITIAL);
  // What they typed survives a refused attempt, as it does on the sign-in form. Only the
  // passwords are asked for again, which is the one pair worth retyping.
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");

  if (state.checkEmail) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 font-medium text-success">
          <MailCheck className="shrink-0" aria-hidden />
          Check your inbox
        </p>
        <p className="text-sm text-ink-muted">
          A confirmation link was requested for{" "}
          <span className="font-medium text-ink">{state.checkEmail}</span>. Check your inbox and
          spam folder. Open the link to finish setting up your account.
        </p>
        <p className="text-sm text-ink-muted">
          Already registered?{" "}
          <Link href="/login" className={INLINE_LINK}>
            Sign in
          </Link>{" "}
          or{" "}
          <Link href="/forgot-password" className={INLINE_LINK}>
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
      {/* Optional here: a blank one is made from the email and shown on the first step of
          setup, where it can be changed. Typed, it is checked as you go. */}
      <UsernameField
        required={false}
        hint="Optional. Lowercase letters, digits, dots and underscores; made from your email if left blank."
      />
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
