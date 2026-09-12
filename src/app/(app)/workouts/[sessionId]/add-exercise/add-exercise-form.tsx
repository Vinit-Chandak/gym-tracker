"use client";

import { useActionState, useState } from "react";

import { ExercisePicker } from "@/components/exercise-picker";
import { Card } from "@/components/ui/card";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import type { ExerciseListItem } from "@/server/repositories/exercises";
import { INITIAL_FORM_STATE, type FormState } from "@/server/validation/form";

type Machine = { id: string; name: string };

type Props = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  exercises: ExerciseListItem[];
  machines: Machine[];
  /** The gym's machines each exercise can actually be done on, keyed by exercise id. */
  machinesByExercise: Record<string, string[]>;
  submitLabel: string;
  /** Renders a "remember as fallback" checkbox for substitutions. */
  remember?: boolean;
  exerciseFieldName?: string;
};

export function PickExerciseForm({
  action,
  exercises,
  machines,
  machinesByExercise,
  submitLabel,
  remember = false,
  exerciseFieldName = "exerciseId",
}: Props) {
  const [state, formAction] = useActionState(keepsFormOnDisconnect(action), INITIAL_FORM_STATE);
  const [exerciseId, setExerciseId] = useState(state.values?.[exerciseFieldName] ?? "");

  const applicableIds = exerciseId ? (machinesByExercise[exerciseId] ?? []) : [];
  const applicable = machines.filter((machine) => applicableIds.includes(machine.id));
  const chosen = exercises.find((e) => e.id === exerciseId);

  return (
    <form action={formAction} className="space-y-[var(--section-gap)]">
      <ExercisePicker
        name={exerciseFieldName}
        exercises={exercises}
        value={exerciseId}
        onChange={setExerciseId}
        error={state.fieldErrors?.[exerciseFieldName]}
      />

      {/*
        The machine question is asked only when there is a decision to make. One applicable
        machine is not a choice, and an exercise that uses none should not be handed a list.
      */}
      <Card>
        {chosen &&
          (applicable.length > 1 ? (
            <Field
              label="Machine"
              info="History is kept per machine, so the load you lifted stays comparable."
              htmlFor="equipment-instance"
              error={state.fieldErrors?.equipmentInstanceId}
            >
              <Select
                id="equipment-instance"
                name="equipmentInstanceId"
                defaultValue={state.values?.equipmentInstanceId ?? ""}
              >
                <option value="">Not on a machine</option>
                {applicable.map((machine) => (
                  <option key={machine.id} value={machine.id}>
                    {machine.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : applicable.length === 1 ? (
            <>
              <input type="hidden" name="equipmentInstanceId" value={applicable[0]!.id} />
              <p className="text-sm text-ink-muted">
                On <span className="font-medium text-ink">{applicable[0]!.name}</span>
              </p>
            </>
          ) : (
            <>
              <input type="hidden" name="equipmentInstanceId" value="" />
              <p className="text-sm text-ink-muted">
                {chosen.requiresEquipment ? "No machine registered here." : "No machine needed."}
              </p>
            </>
          ))}

        {remember && (
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="remember"
              defaultChecked
              className="size-5 accent-[var(--ov-accent)]"
            />
            Remember this as the fallback at this gym
          </label>
        )}

        <FormError message={state.formError} />
        <SubmitButton disabled={!exerciseId}>{submitLabel}</SubmitButton>
      </Card>
    </form>
  );
}
