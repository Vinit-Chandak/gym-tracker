"use client";

import { useActionState, useState } from "react";

import { ExercisePicker } from "@/components/exercise-picker";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ExerciseListItem } from "@/server/repositories/exercises";
import { INITIAL_FORM_STATE, type FormState } from "@/server/validation/form";

type FallbackFormProps = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  exercises: ExerciseListItem[];
  machines: { id: string; name: string }[];
};

export function FallbackForm({ action, exercises, machines }: FallbackFormProps) {
  const [state, formAction] = useActionState(action, INITIAL_FORM_STATE);
  const [exerciseId, setExerciseId] = useState(state.values?.fallbackExerciseId ?? "");

  return (
    <form action={formAction} className="space-y-[var(--section-gap)]">
      <ExercisePicker
        name="fallbackExerciseId"
        exercises={exercises}
        value={exerciseId}
        onChange={setExerciseId}
        error={state.fieldErrors?.fallbackExerciseId}
      />
      <Field
        label="On which machine?"
        hint="Optional. Leave on “Any” for free weights or when the machine is obvious."
        error={state.fieldErrors?.fallbackEquipmentInstanceId}
      >
        <Select
          name="fallbackEquipmentInstanceId"
          defaultValue={state.values?.fallbackEquipmentInstanceId ?? ""}
        >
          <option value="">Any</option>
          {machines.map((machine) => (
            <option key={machine.id} value={machine.id}>
              {machine.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="space-y-2">
        <FormError message={state.formError} />
        <SubmitButton disabled={!exerciseId}>Save fallback</SubmitButton>
      </div>
    </form>
  );
}
