"use client";

import { useActionState } from "react";

import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { GYM_KINDS, type GymKind } from "@/domain/types";
import { GYM_KIND_LABELS } from "@/lib/labels";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { INITIAL_FORM_STATE, type FormState } from "@/server/validation/form";

export type GymFormValues = { name: string; kind: GymKind; address: string; notes: string };

type GymFormProps = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  initial?: GymFormValues;
  submitLabel: string;
};

const KIND_OPTIONS = GYM_KINDS.map((kind) => ({ value: kind, label: GYM_KIND_LABELS[kind] }));

function asKind(value: string | undefined, fallback: GymKind): GymKind {
  return (GYM_KINDS as readonly string[]).includes(value ?? "") ? (value as GymKind) : fallback;
}

export function GymForm({ action, initial, submitLabel }: GymFormProps) {
  const [state, formAction] = useActionState(keepsFormOnDisconnect(action), INITIAL_FORM_STATE);
  const value = (key: keyof GymFormValues): string => state.values?.[key] ?? initial?.[key] ?? "";

  return (
    <form action={formAction} className="space-y-5">
      <Field label="Name" error={state.fieldErrors?.name}>
        <Input
          name="name"
          defaultValue={value("name")}
          maxLength={80}
          autoComplete="off"
          required
        />
      </Field>
      <Field group label="Type" error={state.fieldErrors?.kind}>
        <SegmentedControl
          name="kind"
          options={KIND_OPTIONS}
          defaultValue={asKind(state.values?.kind, initial?.kind ?? "gym")}
        />
      </Field>
      <Field label="Address" hint="Optional" error={state.fieldErrors?.address}>
        <Input
          name="address"
          defaultValue={value("address")}
          maxLength={200}
          autoComplete="street-address"
        />
      </Field>
      <Field label="Notes" hint="Optional" error={state.fieldErrors?.notes}>
        <Textarea name="notes" defaultValue={value("notes")} maxLength={1000} />
      </Field>
      <FormError message={state.formError} />
      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
