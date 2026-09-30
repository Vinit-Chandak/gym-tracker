"use client";
import { coachingAction } from "./client-action";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
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
        <Select required value={modality} onChange={(e) => setModality(e.target.value)}>
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
        <legend className="mb-2 text-sm font-semibold text-ink-muted">
          Primary muscles (optional if unknown)
        </legend>
        {/* Pills that keep their checkbox: a tap anywhere on the pill toggles it, and the box
            still says which are on without relying on the wash alone. */}
        <div className="flex flex-wrap gap-2">
          {MUSCLE_GROUPS.map((m) => (
            <label
              key={m}
              className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-chip bg-surface-raised px-3.5 text-sm font-semibold text-ink-muted transition-colors duration-[var(--ov-duration-feedback)] has-checked:bg-lift-soft has-checked:text-lift-ink"
            >
              <input
                type="checkbox"
                checked={muscles.includes(m)}
                onChange={(e) =>
                  setMuscles(e.target.checked ? [...muscles, m] : muscles.filter((x) => x !== m))
                }
                className="size-4 shrink-0 accent-[var(--ov-lift)]"
              />
              <span className="min-w-0 [overflow-wrap:anywhere]">{MUSCLE_LABELS[m]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Registered machine (required for machine exercises)">
        <Select value={equipment} onChange={(e) => setEquipment(e.target.value)}>
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
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? "Saving…" : "Save to my exercise library"}
      </Button>
    </form>
  );
}
