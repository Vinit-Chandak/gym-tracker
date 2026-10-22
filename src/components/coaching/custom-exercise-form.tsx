"use client";
import { coachingAction } from "./client-action";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  EXERCISE_CATEGORIES,
  EXERCISE_MODALITIES,
  MUSCLE_GROUPS,
  PRESCRIPTION_TYPES,
  type MuscleGroup,
} from "@/domain/types";
import { EXERCISE_CATEGORY_LABELS, EXERCISE_MODALITY_LABELS, MUSCLE_LABELS } from "@/lib/labels";
import { createCustomExerciseAction } from "@/server/actions/manual-training";

const MACHINE_NEEDED = "Choose the registered equipment for this exercise.";
const needsMachine = (modality: string) =>
  ["machine", "smith_machine", "cable", "cardio"].includes(modality);
export function CustomExerciseForm({
  machines,
}: {
  machines: { id: string; name: string; gymName: string }[];
}) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [name, setName] = useState(""),
    [category, setCategory] = useState(""),
    [modality, setModality] = useState(""),
    [measurement, setMeasurement] = useState(""),
    [muscles, setMuscles] = useState<MuscleGroup[]>([]),
    [equipment, setEquipment] = useState(""),
    [notes, setNotes] = useState(""),
    [error, setError] = useState<string | null>(null),
    [saving, setSaving] = useState(false);
  const busy = saving || navigating;
  const machineError = error === MACHINE_NEEDED && needsMachine(modality) && !equipment;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        const result = await coachingAction(() =>
          createCustomExerciseAction({
            name,
            category,
            modality,
            measurement,
            primaryMuscles: muscles,
            equipmentInstanceId: equipment || null,
            notes,
          }),
        );
        // The new exercise takes the form's place, so Back does not open the form again, empty.
        if (result.ok)
          startNavigation(() => router.replace(`/exercises/${result.value.id}` as Route));
        else setError(result.error);
        setSaving(false);
      }}
    >
      <Field label="Exercise name">
        <Input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Category">
        <Select required value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Choose a category</option>
          {EXERCISE_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {EXERCISE_CATEGORY_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Equipment / movement type">
        <Select
          required
          value={modality}
          onChange={(e) => {
            setModality(e.target.value);
            if (error === MACHINE_NEEDED && !needsMachine(e.target.value)) setError(null);
          }}
        >
          <option value="">Choose a type</option>
          {EXERCISE_MODALITIES.map((value) => (
            <option key={value} value={value}>
              {EXERCISE_MODALITY_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="How is one set measured?">
        <Select required value={measurement} onChange={(e) => setMeasurement(e.target.value)}>
          <option value="">Choose a measure</option>
          {PRESCRIPTION_TYPES.map((value) => (
            <option key={value} value={value}>
              {value === "reps" ? "Reps" : value === "duration" ? "Seconds" : "Metres"}
            </option>
          ))}
        </Select>
      </Field>
      <fieldset>
        {/* Optional at the label's end, as a field's (DESIGN.md, Inputs and choices). */}
        <legend className="mb-2 flex w-full items-center gap-1 text-[length:var(--ov-type-meta-small)] font-bold text-ink">
          Primary muscles
          <span className="ml-auto font-medium text-ink-2">Optional</span>
        </legend>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,max(7rem,45%)),1fr))] gap-2">
          {MUSCLE_GROUPS.map((m) => (
            <label key={m} className="flex min-h-[var(--ov-target)] min-w-0 items-center gap-2">
              <input
                type="checkbox"
                checked={muscles.includes(m)}
                onChange={(e) =>
                  setMuscles(e.target.checked ? [...muscles, m] : muscles.filter((x) => x !== m))
                }
                className="size-5 shrink-0"
              />
              <span className="min-w-0 [overflow-wrap:break-word]">{MUSCLE_LABELS[m]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {/* Said on the screen, not in an ⓘ: an exercise of these kinds cannot be saved without it. */}
      <Field
        label="Machine"
        hint="Needed for machine, Smith machine, cable and cardio exercises."
        error={machineError ? MACHINE_NEEDED : undefined}
      >
        <Select
          value={equipment}
          onChange={(e) => {
            setEquipment(e.target.value);
            if (error === MACHINE_NEEDED && e.target.value) setError(null);
          }}
        >
          <option value="">No registered machine</option>
          {machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.gymName}: {m.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Form notes">
        <Textarea maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <FormError message={error ?? undefined} />
      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save exercise"}
      </Button>
    </form>
  );
}
