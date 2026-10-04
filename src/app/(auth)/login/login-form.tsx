"use client";

import { useActionState, useState } from "react";
import Link from "@/components/ui/app-link";

import { Button } from "@/components/ui/button";
import { Glyph } from "@/components/ui/glyphs";
import { Field, Input } from "@/components/ui/input";
import { signInAction, type SignInState } from "@/server/actions/auth";

const INITIAL: SignInState = {};

/**
 * Email, password, Sign in. The browser's own "fill out this field" bubble is turned off
 * (`noValidate`): it speaks US English over the page and vanishes; the app's sentence for an
 * empty field stands under the fields instead, in ink, led by its glyph, as every error does.
 */
export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(signInAction, INITIAL);
  const [email, setEmail] = useState("");

  return (
    <form action={formAction} noValidate className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Email">
        <Input
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </Field>
      <Field label="Password">
        <Input type="password" name="password" autoComplete="current-password" required />
      </Field>
      {state.error && (
        <p role="alert" className="flex items-start gap-2 type-meta font-semibold">
          <Glyph name="warn" className="mt-px glyph-18" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{state.error}</span>
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <Link
        href="/forgot-password"
        className="flex min-h-11 items-center justify-center type-meta font-semibold text-ink-2 underline underline-offset-4"
      >
        Forgot your password?
      </Link>
    </form>
  );
}
