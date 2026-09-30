"use client";

import { useActionState, useState } from "react";

import { ExercisePicker } from "@/components/exercise-picker";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import type { ExerciseListItem } from "@/server/repositories/exercises";
import { INITIAL_FORM_STATE, type FormState } from "@/server/validation/form";

type FallbackFormProps = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  exercises: ExerciseListItem[];
  machines: { id: string; name: string }[];
  compatibleMachines: Record<string, string[]>;
};

/**
 * The library to choose the stand-in from, with what was chosen, its machine and the button
 * kept on screen above the navigation while the list scrolls.
 */
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
  const chosen = exercises.find((exercise) => exercise.id === exerciseId);
  const choose = (id: string) => {
    setExerciseId(id);
    setMachineId("");
  };

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
        onChange={choose}
        error={state.fieldErrors?.fallbackExerciseId}
      />
      <div className="sticky-actions space-y-3">
        <div className="flex min-h-11 items-center justify-between gap-3 px-1">
          <p className="min-w-0 [overflow-wrap:anywhere]">
            {chosen ? (
              <span className="font-semibold">{chosen.name}</span>
            ) : (
              <span className="text-ink-muted">Choose the exercise to do instead</span>
            )}
          </p>
          {chosen && (
            <button
              type="button"
              onClick={() => choose("")}
              className="min-h-11 shrink-0 px-2 text-sm font-semibold text-ink-muted"
            >
              Clear
            </button>
          )}
        </div>
        {/* A machine is asked for only when the chosen exercise can use one here; otherwise
            the fallback is "any", which is what the empty choice always meant. */}
        {chosen && availableMachines.length > 0 ? (
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
        ) : (
          <input type="hidden" name="fallbackEquipmentInstanceId" value="" />
        )}
        <FormError message={state.formError} />
        <SubmitButton disabled={!exerciseId}>Save fallback</SubmitButton>
      </div>
    </form>
  );
}
