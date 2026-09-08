"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section";
import { groupByRegion } from "@/domain/muscles";
import { matchesExerciseQuery } from "@/lib/exercise-search";
import { BODY_REGION_LABELS, EXERCISE_MODALITY_LABELS, MUSCLE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ExerciseListItem } from "@/server/repositories/exercises";

type ExercisePickerProps = {
  name: string;
  exercises: ExerciseListItem[];
  defaultValue?: string;
  error?: string;
};

/** Searchable, muscle-grouped radio list used wherever the user picks one exercise. */
export function ExercisePicker({ name, exercises, defaultValue, error }: ExercisePickerProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(defaultValue ?? "");
  const groups = useMemo(
    () => groupByRegion(exercises.filter((e) => matchesExerciseQuery(e, query))),
    [exercises, query],
  );
  const selectedExercise = exercises.find((e) => e.id === selected);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search
          className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-subtle"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search exercises"
          aria-label="Search exercises"
          className="pl-12"
          autoCapitalize="none"
          autoCorrect="off"
          enterKeyHint="search"
        />
      </div>
      <p className="text-sm text-ink-muted">
        Selected:{" "}
        <span className="font-medium text-ink">{selectedExercise?.name ?? "nothing yet"}</span>
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {groups.length === 0 && <p className="text-sm text-ink-muted">No exercises match.</p>}
      {groups.map((group) => (
        <section key={group.region} className="space-y-2">
          <SectionHeading title={BODY_REGION_LABELS[group.region]} />
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {group.items.map((exercise) => (
              <li key={exercise.id}>
                <label className="block">
                  <input
                    type="radio"
                    name={name}
                    value={exercise.id}
                    checked={selected === exercise.id}
                    onChange={() => setSelected(exercise.id)}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      "flex min-h-14 items-center justify-between gap-3 px-4 py-3",
                      "peer-checked:bg-accent/10 peer-focus-visible:ring-2 peer-focus-visible:ring-accent/60",
                      selected === exercise.id ? "text-accent" : "text-ink",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{exercise.name}</span>
                      <span className="block truncate text-sm text-ink-muted">
                        {EXERCISE_MODALITY_LABELS[exercise.modality]} ·{" "}
                        {exercise.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(", ")}
                      </span>
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
