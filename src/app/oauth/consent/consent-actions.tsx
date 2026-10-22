"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { FormError, SubmitButton } from "@/components/ui/form";

export type ConsentState = { error?: string };
const INITIAL_STATE: ConsentState = {};

/** Keep a refused connection on this screen, with a retry and the same save signals as forms. */
export function ConsentActions({
  action,
}: {
  action: (state: ConsentState, form: FormData) => Promise<ConsentState>;
}) {
  // One state follows the most recent decision, and the server action can POST before hydration.
  const [state, formAction] = useActionState(action, INITIAL_STATE);
  return (
    <form action={formAction} className="space-y-3">
      <FormError message={state.error} />
      <ConsentChoices />
    </form>
  );
}

function ConsentChoices() {
  const { data } = useFormStatus();
  return (
    <div className="flex flex-wrap gap-3">
      <SubmitButton
        name="decision"
        value="approve"
        className="w-auto"
        pendingLabel={
          data?.get("decision") === "approve" ? "Connecting…" : "Connect ChatGPT backup"
        }
      >
        Connect ChatGPT backup
      </SubmitButton>
      <SubmitButton
        name="decision"
        value="decline"
        className="w-auto"
        variant="outline"
        pendingLabel={data?.get("decision") === "decline" ? "Declining…" : "Decline"}
      >
        Decline
      </SubmitButton>
    </div>
  );
}
