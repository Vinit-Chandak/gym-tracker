"use client";

import { Check, Search } from "@/components/ui/icons";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { exerciseSections } from "@/lib/exercise-search";
import { EXERCISE_MODALITY_LABELS, MUSCLE_LABELS } from "@/lib/labels";
import type { ExerciseListItem } from "@/server/repositories/exercises";

type ExercisePickerProps = {
  name: string;
  exercises: ExerciseListItem[];
  /** The chosen exercise id, or "" for none. */
  value: string;
  onChange: (exerciseId: string) => void;
  error?: string;
};

/** How a row says what the movement is: its equipment, then the muscles it works. */
function exerciseLine(exercise: ExerciseListItem): string {
  return [
    EXERCISE_MODALITY_LABELS[exercise.modality],
    exercise.primaryMuscles.map((m) => MUSCLE_LABELS[m].toLowerCase()).join(", "),
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Search first, then grouped results: by body region when nothing is typed, and by how well
 * each exercise answers the search when something is, names first. The whole view is one
 * scroll region, so a long catalogue never becomes a list scrolling inside a sheet scrolling
 * inside a page. What was chosen, and the button that uses it, belong to the form around it,
 * which keeps them on screen while the list scrolls.
 *
 * Nothing is filtered out for being unavailable at the current gym: an exercise you cannot
 * do here is still an exercise, and the machine question is asked separately.
 */
export function ExercisePicker({ name, exercises, value, onChange, error }: ExercisePickerProps) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => exerciseSections(exercises, query), [exercises, query]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle" aria-hidden />
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

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {/* An empty catalogue and a query that matches nothing are different problems. */}
      {exercises.length === 0 ? (
        <p className="px-1 text-sm text-ink-muted">No exercises in the library.</p>
      ) : groups.length === 0 ? (
        <p className="px-1 text-sm text-ink-muted">Nothing matches “{query}”.</p>
      ) : (
        groups.map((group) => (
          <section key={group.key}>
            <h3 className="px-1 pb-2 text-headline font-semibold">{group.title}</h3>
            <ul className="box-rows">
              {group.items.map((exercise) => {
                const chosen = value === exercise.id;
                return (
                  <li key={exercise.id}>
                    {/* The label carries the chosen state so the box's rounding applies to it. */}
                    <label className="block transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised has-checked:bg-lift-soft has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus has-[:focus-visible]:ring-inset">
                      <input
                        type="radio"
                        name={name}
                        value={exercise.id}
                        checked={chosen}
                        onChange={() => onChange(exercise.id)}
                        className="sr-only"
                      />
                      <span className="flex min-h-14 items-center gap-3 px-4 py-2.5">
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold [overflow-wrap:anywhere]">
                            {exercise.name}
                          </span>
                          <span className="block text-sm [overflow-wrap:anywhere] text-ink-muted">
                            {exerciseLine(exercise)}
                          </span>
                        </span>
                        {/* The round check the set rows use, on the one that is chosen. */}
                        {chosen && (
                          <span
                            aria-hidden
                            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-lift text-on-lift"
                          >
                            <Check />
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
