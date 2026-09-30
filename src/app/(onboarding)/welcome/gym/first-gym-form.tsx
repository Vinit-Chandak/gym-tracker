"use client";

import { useActionState } from "react";

import { Card } from "@/components/ui/card";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { GYM_KINDS, type GymKind } from "@/domain/types";
import { GYM_KIND_LABELS } from "@/lib/labels";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { createFirstGymAction } from "@/server/actions/onboarding";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

const KIND_OPTIONS = GYM_KINDS.map((kind) => ({ value: kind, label: GYM_KIND_LABELS[kind] }));

function asKind(value: string | undefined): GymKind {
  return (GYM_KINDS as readonly string[]).includes(value ?? "") ? (value as GymKind) : "gym";
}

/**
 * The gym step's form: a name and what kind of place it is. `secondary` when the athlete has
 * already added one and Continue is the step's main way on, so the two do not compete.
 */
export function FirstGymForm({ secondary = false }: { secondary?: boolean }) {
  const [state, formAction] = useActionState(
    keepsFormOnDisconnect(createFirstGymAction),
    INITIAL_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-4">
      <Card className="space-y-5">
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
      </Card>
      <FormError message={state.formError} />
      <SubmitButton pendingLabel="Adding…" variant={secondary ? "secondary" : "primary"}>
        Add gym
      </SubmitButton>
    </form>
  );
}
