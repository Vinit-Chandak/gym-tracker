"use client";

import { useActionState } from "react";

import { ExercisePicker } from "@/components/exercise-picker";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ExerciseListItem } from "@/server/repositories/exercises";
import { INITIAL_FORM_STATE, type FormState } from "@/server/validation/form";

type Props = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  exercises: ExerciseListItem[];
  machines: { id: string; name: string }[];
  submitLabel: string;
  /** Renders a "remember as fallback" checkbox for substitutions. */
  remember?: boolean;
  exerciseFieldName?: string;
};

export function PickExerciseForm({
  action,
  exercises,
  machines,
  submitLabel,
  remember = false,
  exerciseFieldName = "exerciseId",
}: Props) {
  const [state, formAction] = useActionState(action, INITIAL_FORM_STATE);
  return (
    <form action={formAction} className="space-y-5">
      <ExercisePicker
        name={exerciseFieldName}
        exercises={exercises}
        defaultValue={state.values?.[exerciseFieldName]}
        error={state.fieldErrors?.[exerciseFieldName]}
      />
      <Field
        label="Machine"
        hint="Optional; pick one for machine and cable exercises so history stays per machine."
        error={state.fieldErrors?.equipmentInstanceId}
      >
        <Select name="equipmentInstanceId" defaultValue={state.values?.equipmentInstanceId ?? ""}>
          <option value="">None / free weights</option>
          {machines.map((machine) => (
            <option key={machine.id} value={machine.id}>
              {machine.name}
            </option>
          ))}
        </Select>
      </Field>
      {remember && (
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="remember" defaultChecked className="size-5 accent-accent" />
          Remember this as the fallback at this gym
        </label>
      )}
      <FormError message={state.formError} />
      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
