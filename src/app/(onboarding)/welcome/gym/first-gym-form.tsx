"use client";

import { useActionState } from "react";

import { FormError, SubmitButton } from "@/components/ui/form";
import { gymKindGlyph } from "@/components/ui/glyphs";
import { IconChoice } from "@/components/ui/icon-choice";
import { Field, Input } from "@/components/ui/input";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { GYM_KINDS, type GymKind } from "@/domain/types";
import { GYM_KIND_LABELS } from "@/lib/labels";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { createFirstGymAction } from "@/server/actions/onboarding";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

import { SkipLink } from "../skip-link";

const KIND_OPTIONS = GYM_KINDS.map((kind) => ({
  value: kind,
  label: GYM_KIND_LABELS[kind],
  glyph: gymKindGlyph(kind),
}));

function asKind(value: string | undefined): GymKind {
  return (GYM_KINDS as readonly string[]).includes(value ?? "") ? (value as GymKind) : "gym";
}

/** Board Gym step: the place's name, its kind as three tiles; Add gym, or skip it. */
export function FirstGymForm() {
  const [state, formAction] = useActionState(
    keepsFormOnDisconnect(createFirstGymAction),
    INITIAL_FORM_STATE,
  );

  return (
    <form action={formAction} className="mt-4.5 space-y-4">
      <Field label="Name" error={state.fieldErrors?.name}>
        <Input
          name="name"
          defaultValue={state.values?.name ?? ""}
          placeholder="e.g. Anytime Fitness, Home"
          maxLength={80}
          autoComplete="off"
          required
        />
      </Field>
      <div className="space-y-1.5" data-field-error={state.fieldErrors?.kind ? "true" : undefined}>
        <p className="text-[length:var(--ov-type-meta-small)] font-bold">Type</p>
        <IconChoice
          name="kind"
          label="Type"
          options={KIND_OPTIONS}
          defaultValue={asKind(state.values?.kind)}
        />
        {state.fieldErrors?.kind && (
          <p role="alert" className="type-meta-small font-semibold">
            {state.fieldErrors.kind}
          </p>
        )}
      </div>
      <PinnedActions stack>
        <FormError message={state.formError} />
        <SubmitButton pendingLabel="Adding…">Add gym</SubmitButton>
        <SkipLink href="/welcome/programme" />
      </PinnedActions>
    </form>
  );
}
