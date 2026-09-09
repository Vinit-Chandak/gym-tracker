"use client";

import { useActionState } from "react";
import { ChevronDown } from "lucide-react";

import { ProfileFields, type ProfileFieldValues } from "@/components/profile-fields";
import { Card } from "@/components/ui/card";
import { FormError, SubmitButton } from "@/components/ui/form";
import { saveProfileAction } from "@/server/actions/profile";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

export function ProfileCard({ email, values }: { email: string; values: ProfileFieldValues }) {
  const [state, formAction] = useActionState(saveProfileAction, INITIAL_FORM_STATE);
  const saved =
    state.fieldErrors === undefined && state.formError === undefined && state.values === undefined;

  return (
    <Card variant="plain" className="border-t-0 pt-0 pb-0">
      <div>
        <h2 className="text-lg font-semibold">{values.displayName || "Your profile"}</h2>
        <p className="text-sm break-words text-ink-muted">{email}</p>
      </div>
      <details className="group">
        <summary className="flex min-h-11 items-center justify-between gap-2 text-sm font-medium text-accent">
          Edit profile{" "}
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <form action={formAction} className="space-y-4 pt-3">
          <ProfileFields values={values} errors={state.fieldErrors} />
          <FormError message={state.formError} />
          <SubmitButton variant="secondary" pendingLabel="Saving…">
            Save
          </SubmitButton>
          <p className="sr-only" role="status">
            {saved ? "Profile saved" : ""}
          </p>
        </form>
      </details>
    </Card>
  );
}
