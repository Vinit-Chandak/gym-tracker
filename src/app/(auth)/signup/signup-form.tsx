"use client";

import { startTransition, useActionState, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import Link from "@/components/ui/app-link";
import { Glyph } from "@/components/ui/glyphs";
import { Field, Input } from "@/components/ui/input";
import { signUpAction, type SignUpState } from "@/server/actions/auth";

import { AUTH_LINK } from "../auth-link";

const INITIAL: SignUpState = {};

/**
 * Board Sign up: a name (optional), the email and one password with Show, then Create account.
 * The password is not typed twice: Show is how it is checked, as on the sign-in form. No
 * username either: one is made from the name and changed later in the profile, so setup asks
 * none of these again.
 *
 * As on sign-in, the browser's own validation bubble is off and each sentence stands under the
 * field it is about, in ink, led by its glyph; what was typed stays typed, the password
 * included, so a slip is corrected rather than typed again.
 */
export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUpAction, INITIAL);
  const [shown, setShown] = useState(false);
  const alertId = useId();
  const general = state.error && !state.field;

  if (state.checkEmail) {
    return (
      <div role="status" className="space-y-3">
        <p className="flex items-center gap-2 type-heading">
          <Glyph name="check" className="glyph-20 shrink-0" />
          Check your inbox
        </p>
        <p className="type-body text-ink-2">
          A confirmation link was sent to{" "}
          <span className="font-bold [overflow-wrap:anywhere] text-ink">{state.checkEmail}</span>.
          Open it to finish setting up your account. If it is not there, look in your spam folder.
        </p>
        <p className="type-meta text-ink-2">
          Already registered?{" "}
          <Link href="/login" className={AUTH_LINK}>
            Sign in
          </Link>{" "}
          or{" "}
          <Link href="/forgot-password" className={AUTH_LINK}>
            reset your password
          </Link>
        </p>
      </div>
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
      noValidate
      className="space-y-4"
    >
      <Field label="Name" aside="Optional">
        <Input type="text" name="displayName" autoComplete="name" maxLength={80} />
      </Field>
      <Field label="Email" error={state.field === "email" ? state.error : undefined}>
        <Input
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
      </Field>
      <Field
        label="Password"
        hint="At least 8 characters"
        error={state.field === "password" ? state.error : undefined}
        aside={
          <button
            type="button"
            // The word on screen leads the name, so a voice command saying it still finds it.
            aria-label={shown ? "Hide password" : "Show password"}
            onClick={() => setShown((value) => !value)}
            className="-my-3 inline-flex min-h-11 min-w-11 items-center justify-end px-1 font-bold text-ink underline underline-offset-4"
          >
            {shown ? "Hide" : "Show"}
          </button>
        }
      >
        <Input
          type={shown ? "text" : "password"}
          name="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>
      {general && (
        <p id={alertId} role="alert" className="flex items-start gap-2 type-meta font-semibold">
          <Glyph name="warn" className="mt-px glyph-18" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{state.error}</span>
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
