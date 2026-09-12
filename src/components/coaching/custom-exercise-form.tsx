"use client";
import { coachingAction } from "./client-action";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea, INPUT_CLASS } from "@/components/ui/input";
import {
  EXERCISE_CATEGORIES,
  EXERCISE_MODALITIES,
  MUSCLE_GROUPS,
  PRESCRIPTION_TYPES,
  type MuscleGroup,
} from "@/domain/types";
import { EXERCISE_MODALITY_LABELS, MUSCLE_LABELS } from "@/lib/labels";
import { createCustomExerciseAction } from "@/server/actions/manual-training";
export function CustomExerciseForm({
  machines,
}: {
  machines: { id: string; name: string; gymName: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState(""),
    [category, setCategory] = useState(""),
    [modality, setModality] = useState(""),
    [measurement, setMeasurement] = useState(""),
    [muscles, setMuscles] = useState<MuscleGroup[]>([]),
    [equipment, setEquipment] = useState(""),
    [notes, setNotes] = useState(""),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
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
        if (result.ok) router.push(`/exercises/${result.value.id}` as Route);
        else setError(result.error);
        setBusy(false);
      }}
    >
      <h1 className="text-xl font-medium">Add your own exercise</h1>
      <Field label="Exercise name">
        <Input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Category">
        <select
          className={INPUT_CLASS}
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Choose a category</option>
          {EXERCISE_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Equipment / movement type">
        <select
          className={INPUT_CLASS}
          required
          value={modality}
          onChange={(e) => setModality(e.target.value)}
        >
          <option value="">Choose a type</option>
          {EXERCISE_MODALITIES.map((value) => (
            <option key={value} value={value}>
              {EXERCISE_MODALITY_LABELS[value]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="How is one set measured?">
        <select
          className={INPUT_CLASS}
          required
          value={measurement}
          onChange={(e) => setMeasurement(e.target.value)}
        >
          <option value="">Choose a measure</option>
          {PRESCRIPTION_TYPES.map((value) => (
            <option key={value} value={value}>
              {value === "reps" ? "Reps" : value === "duration" ? "Seconds" : "Metres"}
            </option>
          ))}
        </select>
      </Field>
      <fieldset>
        <legend className="mb-2 text-sm text-ink-muted">
          Primary muscles (optional if unknown)
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {MUSCLE_GROUPS.map((m) => (
            <label key={m} className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={muscles.includes(m)}
                onChange={(e) =>
                  setMuscles(e.target.checked ? [...muscles, m] : muscles.filter((x) => x !== m))
                }
                className="size-5"
              />
              {MUSCLE_LABELS[m]}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Registered machine (required for machine exercises)">
        <select
          className={INPUT_CLASS}
          value={equipment}
          onChange={(e) => setEquipment(e.target.value)}
        >
          <option value="">No registered machine</option>
          {machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.gymName}: {m.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Form notes">
        <Textarea maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save to my exercise library"}
      </Button>
    </form>
  );
}
