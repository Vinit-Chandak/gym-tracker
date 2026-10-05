"use client";

import { startTransition, useActionState, useId, useState } from "react";
import Link from "@/components/ui/app-link";

import { Button } from "@/components/ui/button";
import { Glyph } from "@/components/ui/glyphs";
import { Field, Input } from "@/components/ui/input";
import { signInAction, type SignInState } from "@/server/actions/auth";

const INITIAL: SignInState = {};

/**
 * Email, password, Sign in. The browser's own "fill out this field" bubble is turned off
 * (`noValidate`): it speaks US English over the page and vanishes; the app's sentence stands
 * instead, in ink, led by its glyph, as every error does. A sentence about one field stands
 * under that field and marks it; a sign-in that did not work is about both, so it stands under
 * the fields and both point at it. Show reveals the password to check it.
 *
 * What was typed stays typed, the password included, so a slip is corrected rather than typed
 * again. The fields hold their own values: a value React held would be put back to blank by
 * the first render after a password manager or a quick thumb filled the field while the page
 * was still starting. So the form is sent in a transition of its own rather than as the form's
 * action, which React follows by clearing the fields; without JavaScript it posts as it is.
 */
export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(signInAction, INITIAL);
  const [shown, setShown] = useState(false);
  const alertId = useId();
  const both = state.error && !state.field;

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
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Email" error={state.field === "email" ? state.error : undefined}>
        <Input
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          aria-describedby={both ? alertId : undefined}
          aria-invalid={both ? true : undefined}
          required
        />
      </Field>
      <Field
        label="Password"
        error={state.field === "password" ? state.error : undefined}
        aside={
          <button
            type="button"
            // The word on screen leads the name, so a voice command saying it still finds it.
            aria-label={shown ? "Hide password" : "Show password"}
            onClick={() => setShown((value) => !value)}
            className="-my-3 inline-flex min-h-11 items-center px-1 font-bold text-ink underline underline-offset-4"
          >
            {shown ? "Hide" : "Show"}
          </button>
        }
      >
        <Input
          type={shown ? "text" : "password"}
          name="password"
          autoComplete="current-password"
          aria-describedby={both ? alertId : undefined}
          aria-invalid={both ? true : undefined}
          required
        />
      </Field>
      {both && (
        <p id={alertId} role="alert" className="flex items-start gap-2 type-meta font-semibold">
          <Glyph name="warn" className="mt-px glyph-18" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{state.error}</span>
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <Link
        href="/forgot-password"
        className="flex min-h-11 items-center justify-center type-meta font-bold text-ink underline underline-offset-4"
      >
        Forgot your password?
      </Link>
    </form>
  );
}
