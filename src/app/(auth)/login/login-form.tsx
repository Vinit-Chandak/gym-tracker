"use client";

import { useActionState, useState } from "react";
import Link from "@/components/ui/app-link";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { signInAction, type SignInState } from "@/server/actions/auth";

const INITIAL: SignInState = {};

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(signInAction, INITIAL);
  const [email, setEmail] = useState("");

  return (
    <form action={formAction} className="space-y-4">
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
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <Link
        href="/forgot-password"
        className="flex min-h-11 items-center justify-center text-sm text-ink-muted underline-offset-4 hover:underline"
      >
        Forgot your password?
      </Link>
    </form>
  );
}
