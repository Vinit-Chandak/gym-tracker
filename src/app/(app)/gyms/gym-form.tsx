"use client";

import { useActionState, useState } from "react";

import { FormError, SubmitButton, useKeptForm } from "@/components/ui/form";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { GYM_KINDS, type GymKind } from "@/domain/types";
import { GYM_KIND_LABELS } from "@/lib/labels";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { INITIAL_FORM_STATE, type FormState } from "@/server/validation/form";
import { gymInputSchema } from "@/server/validation/gyms";

export type GymFormValues = { name: string; kind: GymKind; address: string; notes: string };

type GymFormProps = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  initial?: GymFormValues;
  submitLabel: string;
};

const KIND_OPTIONS = GYM_KINDS.map((kind) => ({ value: kind, label: GYM_KIND_LABELS[kind] }));

export function GymForm({ action, initial, submitLabel }: GymFormProps) {
  const form = useKeptForm();
  const [state, formAction] = useActionState(keepsFormOnDisconnect(action), INITIAL_FORM_STATE);
  const [values, setValues] = useState<GymFormValues>(
    initial ?? { name: "", kind: "gym", address: "", notes: "" },
  );
  const error = (key: keyof GymFormValues) =>
    state.fieldErrors?.[key] && !gymInputSchema.shape[key].safeParse(values[key]).success
      ? state.fieldErrors[key]
      : undefined;
  const change = <K extends keyof GymFormValues>(key: K, value: GymFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  return (
    <form ref={form} action={formAction} className="space-y-5">
      <Field label="Name" error={error("name")}>
        <Input
          name="name"
          value={values.name}
          onChange={(event) => change("name", event.target.value)}
          maxLength={80}
          autoComplete="off"
          required
        />
      </Field>
      <Field group label="Type" error={error("kind")}>
        <SegmentedControl
          name="kind"
          options={KIND_OPTIONS}
          value={values.kind}
          onChange={(kind) => change("kind", kind)}
        />
      </Field>
      <Field label="Address" aside="Optional" error={error("address")}>
        <Input
          name="address"
          value={values.address}
          onChange={(event) => change("address", event.target.value)}
          maxLength={200}
          autoComplete="street-address"
        />
      </Field>
      <Field label="Notes" aside="Optional" error={error("notes")}>
        <Textarea
          name="notes"
          value={values.notes}
          onChange={(event) => change("notes", event.target.value)}
          maxLength={1000}
        />
      </Field>
      <FormError message={state.formError} />
      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
