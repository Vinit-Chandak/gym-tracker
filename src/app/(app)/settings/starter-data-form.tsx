"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { setUpStarterDataAction, type StarterDataState } from "@/server/actions/starter-data";

const INITIAL: StarterDataState = {};

export function StarterDataForm() {
  const [state, formAction, pending] = useActionState(setUpStarterDataAction, INITIAL);

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm text-ink-muted">
        Creates your three gyms, the Anytime Fitness machines and the 8-week programme starting 8
        September 2026. Nothing is overwritten if it already exists.
      </p>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Setting up…" : "Set up starter data"}
      </Button>
    </form>
  );
}
