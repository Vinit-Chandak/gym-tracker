"use client";

import { useActionState } from "react";

import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { GYM_KINDS, type GymKind } from "@/domain/types";
import { GYM_KIND_LABELS } from "@/lib/labels";
import { createFirstGymAction } from "@/server/actions/onboarding";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

const KIND_OPTIONS = GYM_KINDS.map((kind) => ({ value: kind, label: GYM_KIND_LABELS[kind] }));

function asKind(value: string | undefined): GymKind {
  return (GYM_KINDS as readonly string[]).includes(value ?? "") ? (value as GymKind) : "gym";
}

export function FirstGymForm() {
  const [state, formAction] = useActionState(createFirstGymAction, INITIAL_FORM_STATE);

  return (
    <form action={formAction} className="space-y-5">
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
      <Field group label="Type" error={state.fieldErrors?.kind}>
        <SegmentedControl
          name="kind"
          options={KIND_OPTIONS}
          defaultValue={asKind(state.values?.kind)}
        />
      </Field>
      <FormError message={state.formError} />
      <SubmitButton pendingLabel="Adding…">Add gym</SubmitButton>
    </form>
  );
}
