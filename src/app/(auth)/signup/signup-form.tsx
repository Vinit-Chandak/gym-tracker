"use client";

import { MailCheck } from "@/components/ui/icons";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import Link from "@/components/ui/app-link";
import { Field, Input } from "@/components/ui/input";
import { UsernameField } from "@/components/username-field";
import { signUpAction, type SignUpState } from "@/server/actions/auth";

const INITIAL: SignUpState = {};

const INLINE_LINK = "font-semibold text-accent underline-offset-4 hover:underline";

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUpAction, INITIAL);
  // What they typed survives a refused attempt, as it does on the sign-in form. Only the
  // passwords are asked for again, which is the one pair worth retyping.
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");

  if (state.checkEmail) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 font-semibold text-success">
          <MailCheck className="shrink-0" aria-hidden />
          Check your inbox
        </p>
        <p className="text-sm text-ink-muted">
          A confirmation link was requested for{" "}
          <span className="font-semibold [overflow-wrap:anywhere] text-ink">
            {state.checkEmail}
          </span>
          . Open it to finish setting up your account. Nothing there? Look in your spam folder.
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
        hint="Optional"
        info="What friends find you by: lowercase letters, digits, dots and underscores. Leave it blank and one is made from your email; you can change it on the next screen."
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
      <div className="pt-1">
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </div>
    </form>
  );
}
