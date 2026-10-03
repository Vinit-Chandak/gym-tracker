"use client";

import { useActionState, useState } from "react";

import { ExercisePicker } from "@/components/exercise-picker";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Glyph } from "@/components/ui/glyphs";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { SelectRow } from "@/components/ui/select-row";
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
  /** Name the chosen exercise under the search and count each group (a long list). */
  long?: boolean;
};

/**
 * Choosing an exercise for the session (board Add exercise): the search and its results, then,
 * pinned at the foot, where it will be done and the button that adds it. The machine question
 * answers itself where it can: one machine is named, none is said, and only two or more ask.
 */
export function PickExerciseForm({
  action,
  exercises,
  machines,
  machinesByExercise,
  submitLabel,
  remember = false,
  exerciseFieldName = "exerciseId",
  long = false,
}: Props) {
  const [state, formAction] = useActionState(keepsFormOnDisconnect(action), INITIAL_FORM_STATE);
  const [exerciseId, setExerciseId] = useState(state.values?.[exerciseFieldName] ?? "");

  const applicableIds = exerciseId ? (machinesByExercise[exerciseId] ?? []) : [];
  const applicable = machines.filter((machine) => applicableIds.includes(machine.id));
  const chosen = exercises.find((e) => e.id === exerciseId);

  return (
    <form action={formAction}>
      <ExercisePicker
        name={exerciseFieldName}
        exercises={exercises}
        value={exerciseId}
        onChange={setExerciseId}
        error={state.fieldErrors?.[exerciseFieldName]}
        long={long}
      />

      <PinnedActions stack>
        {/*
          The machine question is asked only when there is a decision to make. One applicable
          machine is not a choice, and an exercise that uses none should not be handed a list.
        */}
        {chosen &&
          (applicable.length > 1 ? (
            <SelectRow
              label="Machine"
              name="equipmentInstanceId"
              defaultValue={state.values?.equipmentInstanceId ?? ""}
              error={state.fieldErrors?.equipmentInstanceId}
              options={[
                { value: "", label: "Not on a machine" },
                ...applicable.map((machine) => ({ value: machine.id, label: machine.name })),
              ]}
            />
          ) : applicable.length === 1 ? (
            <p className="pinned-fact">
              <input type="hidden" name="equipmentInstanceId" value={applicable[0]!.id} />
              <Glyph name="machine" className="glyph-18" />
              <span className="min-w-0 [overflow-wrap:anywhere]">On {applicable[0]!.name}</span>
            </p>
          ) : (
            <p className="pinned-fact text-ink-2">
              <input type="hidden" name="equipmentInstanceId" value="" />
              {chosen.requiresEquipment ? "No machine registered here." : "No machine needed."}
            </p>
          ))}

        {remember && (
          <label className="check-row">
            <input type="checkbox" name="remember" defaultChecked className="check-row-box" />
            Remember this as the fallback at this gym
          </label>
        )}

        <FormError message={state.formError} />
        <SubmitButton disabled={!exerciseId}>{submitLabel}</SubmitButton>
      </PinnedActions>
    </form>
  );
}
