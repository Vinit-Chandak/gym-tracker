"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { groupByRegion } from "@/domain/muscles";
import { matchesExerciseQuery } from "@/lib/exercise-search";
import { BODY_REGION_LABELS, EXERCISE_MODALITY_LABELS, MUSCLE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ExerciseListItem } from "@/server/repositories/exercises";

type ExercisePickerProps = {
  name: string;
  exercises: ExerciseListItem[];
  /** The chosen exercise id, or "" for none. */
  value: string;
  onChange: (exerciseId: string) => void;
  error?: string;
};

/**
 * Search first, then grouped results. The whole view is one scroll region, so a long
 * catalogue never becomes a list scrolling inside a sheet scrolling inside a page.
 *
 * Nothing is filtered out for being unavailable at the current gym: an exercise you cannot
 * do here is still an exercise, and the machine question is asked separately.
 */
export function ExercisePicker({ name, exercises, value, onChange, error }: ExercisePickerProps) {
  const [query, setQuery] = useState("");
  const groups = useMemo(
    () => groupByRegion(exercises.filter((e) => matchesExerciseQuery(e, query))),
    [exercises, query],
  );
  const selected = exercises.find((e) => e.id === value);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, muscle or equipment"
          aria-label="Search exercises"
          className="pl-9"
          autoCapitalize="none"
          autoCorrect="off"
          enterKeyHint="search"
        />
      </div>

      <div className="flex min-h-11 items-center justify-between gap-3">
        <p className="min-w-0 text-sm">
          <span className="text-ink-muted">Selected: </span>
          <span className="font-medium [overflow-wrap:anywhere]">
            {selected?.name ?? "nothing yet"}
          </span>
        </p>
        {selected && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="shrink-0 px-2 text-sm font-medium text-ink-muted"
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {/* An empty catalogue and a query that matches nothing are different problems. */}
      {exercises.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No exercises in the library yet. Add one from the exercise library first.
        </p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Nothing matches “{query}”. Try a muscle or a piece of equipment.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.region}>
            <h3 className="border-b border-line pb-1 text-xs font-medium tracking-wide text-ink-muted uppercase">
              {BODY_REGION_LABELS[group.region]}
            </h3>
            <ul className="ruled-list">
              {group.items.map((exercise) => (
                <li key={exercise.id}>
                  <label className="block">
                    <input
                      type="radio"
                      name={name}
                      value={exercise.id}
                      checked={value === exercise.id}
                      onChange={() => onChange(exercise.id)}
                      className="peer sr-only"
                    />
                    <span
                      className={cn(
                        "flex min-h-14 items-center gap-3 py-2.5",
                        "peer-checked:bg-accent-soft peer-focus-visible:ring-2 peer-focus-visible:ring-focus",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium [overflow-wrap:anywhere]">
                          {exercise.name}
                        </span>
                        <span className="block text-sm [overflow-wrap:anywhere] text-ink-muted">
                          {EXERCISE_MODALITY_LABELS[exercise.modality]} ·{" "}
                          {exercise.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(", ")}
                        </span>
                      </span>
                      {value === exercise.id && (
                        <span className="shrink-0 pr-2 text-sm font-medium text-accent">
                          Chosen
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
