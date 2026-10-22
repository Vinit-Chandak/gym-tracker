"use client";

import { useActionState, useState } from "react";

import { LinkButton, Button } from "@/components/ui/button";
import { FormError, useKeptForm } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { SavedNotice } from "@/components/ui/saved-notice";
import { updatePasswordAction, type PasswordChangeState } from "@/server/actions/auth";

const INITIAL: PasswordChangeState = {};

export function ResetPasswordForm() {
  const form = useKeptForm();
  const [state, formAction, pending] = useActionState(updatePasswordAction, INITIAL);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [lastState, setLastState] = useState(state);
  const [edited, setEdited] = useState(false);
  const [rejectedPassword, setRejectedPassword] = useState("");
  if (lastState !== state) {
    setLastState(state);
    setEdited(false);
    setRejectedPassword(password);
  }
  const validLength = password.length >= 8 && password.length <= 72;
  const corrected =
    edited &&
    validLength &&
    (state.field === "confirmPassword" ? confirmation === password : password !== rejectedPassword);
  const fieldError = corrected ? undefined : state.error;

  if (state.done) {
    return (
      <div className="space-y-3">
        <SavedNotice>Password updated</SavedNotice>
        <LinkButton href="/today" size="lg" className="w-full">
          Go to Today
        </LinkButton>
      </div>
    );
  }

  return (
    <form ref={form} action={formAction} className="space-y-4" noValidate>
      <Field
        label="New password"
        hint="At least 8 characters"
        error={state.field === "password" ? fieldError : undefined}
      >
        <Input
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setEdited(true);
          }}
        />
      </Field>
      <Field
        label="Confirm new password"
        error={state.field === "confirmPassword" ? fieldError : undefined}
      >
        <Input
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          minLength={8}
          required
          value={confirmation}
          onChange={(event) => {
            setConfirmation(event.target.value);
            if (state.field === "confirmPassword") setEdited(true);
          }}
        />
      </Field>
      <FormError message={state.field ? undefined : state.error} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
