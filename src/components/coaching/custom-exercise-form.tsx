"use client";
import { coachingAction } from "./client-action";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Section } from "@/components/ui/section";
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

/**
 * A new exercise for the library: what it is, how it is counted, what it works and where it
 * is done, as three ruled blocks of fields with one highlighter at the end.
 */
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
      className="space-y-[var(--section-gap)]"
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
      <h2 className="text-2xl">Add your own exercise</h2>
      <Section title="The exercise">
        <Card className="space-y-4">
          <Field label="Exercise name">
            <Input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
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
          </div>
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
        </Card>
      </Section>
      <Section title="What it works">
        <Card>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-muted">
              Primary muscles (optional if unknown)
            </legend>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,max(7rem,45%)),1fr))] gap-x-3">
              {MUSCLE_GROUPS.map((m) => (
                <label key={m} className="flex min-h-11 min-w-0 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={muscles.includes(m)}
                    onChange={(e) =>
                      setMuscles(
                        e.target.checked ? [...muscles, m] : muscles.filter((x) => x !== m),
                      )
                    }
                    className="size-5 shrink-0"
                  />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{MUSCLE_LABELS[m]}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </Card>
      </Section>
      <Section title="Where it is done">
        <Card className="space-y-4">
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
        </Card>
      </Section>
      <div className="space-y-3">
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Saving…" : "Save to my exercise library"}
        </Button>
      </div>
    </form>
  );
}
