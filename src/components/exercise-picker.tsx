"use client";

import { Check, Search } from "@/components/ui/icons";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exerciseSections } from "@/lib/exercise-search";
import { EXERCISE_MODALITY_LABELS, MUSCLE_LABELS } from "@/lib/labels";
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
 * Search first, then grouped results: by body region when nothing is typed, and by how well
 * each exercise answers the search when something is, names first. The whole view is one
 * scroll region, so a long catalogue never becomes a list scrolling inside a sheet scrolling
 * inside a page. The chosen row sits under the highlighter's wash with a tick.
 *
 * Nothing is filtered out for being unavailable at the current gym: an exercise you cannot
 * do here is still an exercise, and the machine question is asked separately.
 */
export function ExercisePicker({ name, exercises, value, onChange, error }: ExercisePickerProps) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => exerciseSections(exercises, query), [exercises, query]);
  const selected = exercises.find((e) => e.id === value);

  return (
    <div className="space-y-[var(--section-gap)]">
      <div className="space-y-1">
        <div className="relative">
          <Search
            className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle"
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
            <Button
              variant="ghost"
              size="sm"
              className="-mr-3 shrink-0"
              onClick={() => onChange("")}
            >
              Clear
            </Button>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      {/* An empty catalogue and a query that matches nothing are different problems. */}
      {exercises.length === 0 ? (
        <p className="text-sm text-ink-muted">No exercises in the library.</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-ink-muted">Nothing matches “{query}”.</p>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="min-w-0">
            <h3 className="pb-2 text-xs font-semibold tracking-[0.08em] text-ink-muted uppercase">
              {group.title}
            </h3>
            <ul className="box-rows">
              {group.items.map((exercise) => {
                const chosen = value === exercise.id;
                return (
                  <li key={exercise.id}>
                    {/* The label carries the chosen state, so the whole row is the target. */}
                    <label
                      className={cn(
                        "flex min-h-14 cursor-pointer items-center gap-3 py-2.5 transition-colors duration-[var(--ov-duration-feedback)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus has-[:focus-visible]:ring-inset",
                        chosen ? "bg-highlight-soft" : "active:bg-surface-raised",
                      )}
                    >
                      <input
                        type="radio"
                        name={name}
                        value={exercise.id}
                        checked={chosen}
                        onChange={() => onChange(exercise.id)}
                        className="sr-only"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium [overflow-wrap:anywhere]">
                          {exercise.name}
                        </span>
                        <span className="block text-sm [overflow-wrap:anywhere] text-ink-muted">
                          {EXERCISE_MODALITY_LABELS[exercise.modality]} ·{" "}
                          {exercise.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(", ")}
                        </span>
                      </span>
                      {chosen && (
                        <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-ink">
                          Chosen
                          <Check className="shrink-0 text-pen" aria-hidden />
                        </span>
                      )}
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
