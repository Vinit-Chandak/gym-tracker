"use client";

import { useActionState, useState } from "react";

import { ExercisePicker } from "@/components/exercise-picker";
import { Card } from "@/components/ui/card";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ExerciseListItem } from "@/server/repositories/exercises";
import { INITIAL_FORM_STATE, type FormState } from "@/server/validation/form";

type FallbackFormProps = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  exercises: ExerciseListItem[];
  machines: { id: string; name: string }[];
  compatibleMachines: Record<string, string[]>;
};

export function FallbackForm({
  action,
  exercises,
  machines,
  compatibleMachines,
}: FallbackFormProps) {
  const [state, formAction] = useActionState(action, INITIAL_FORM_STATE);
  const [exerciseId, setExerciseId] = useState(state.values?.fallbackExerciseId ?? "");
  const [machineId, setMachineId] = useState("");
  const availableMachines = machines.filter((machine) =>
    compatibleMachines[exerciseId]?.includes(machine.id),
  );

  return (
    <form
      action={formAction}
      onReset={(event) => event.preventDefault()}
      className="space-y-[var(--section-gap)]"
    >
      <ExercisePicker
        name="fallbackExerciseId"
        exercises={exercises}
        value={exerciseId}
        onChange={(id) => {
          setExerciseId(id);
          setMachineId("");
        }}
        error={state.fieldErrors?.fallbackExerciseId}
      />
      <Card>
        <Field label="Machine" error={state.fieldErrors?.fallbackEquipmentInstanceId}>
          <Select
            name="fallbackEquipmentInstanceId"
            value={machineId}
            onChange={(event) => setMachineId(event.target.value)}
          >
            <option value="">Any</option>
            {availableMachines.map((machine) => (
              <option key={machine.id} value={machine.id}>
                {machine.name}
              </option>
            ))}
          </Select>
        </Field>
        <FormError message={state.formError} />
        <SubmitButton disabled={!exerciseId}>Save fallback</SubmitButton>
      </Card>
    </form>
  );
}
