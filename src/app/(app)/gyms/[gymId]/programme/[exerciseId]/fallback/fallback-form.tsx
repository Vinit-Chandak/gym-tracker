"use client";

import { useActionState, useState } from "react";

import { ExercisePicker } from "@/components/exercise-picker";
import { FormError, SubmitButton } from "@/components/ui/form";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { SelectRow } from "@/components/ui/select-row";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
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
  const [state, formAction] = useActionState(keepsFormOnDisconnect(action), INITIAL_FORM_STATE);
  const [exerciseId, setExerciseId] = useState(state.values?.fallbackExerciseId ?? "");
  const [machineId, setMachineId] = useState("");
  const availableMachines = machines.filter((machine) =>
    compatibleMachines[exerciseId]?.includes(machine.id),
  );

  // Board Add fallback: the search over every other exercise, the chosen one named under it;
  // the machine and Save fallback pinned at the foot.
  return (
    <form action={formAction} onReset={(event) => event.preventDefault()}>
      <ExercisePicker
        name="fallbackExerciseId"
        exercises={exercises}
        value={exerciseId}
        onChange={(id) => {
          setExerciseId(id);
          setMachineId("");
        }}
        error={state.fieldErrors?.fallbackExerciseId}
        long
      />
      <PinnedActions stack>
        <SelectRow
          label="Machine"
          name="fallbackEquipmentInstanceId"
          value={machineId}
          onChange={setMachineId}
          error={state.fieldErrors?.fallbackEquipmentInstanceId}
          options={[
            { value: "", label: "Any" },
            ...availableMachines.map((machine) => ({ value: machine.id, label: machine.name })),
          ]}
        />
        <FormError message={state.formError} />
        <SubmitButton disabled={!exerciseId}>Save fallback</SubmitButton>
      </PinnedActions>
    </form>
  );
}
