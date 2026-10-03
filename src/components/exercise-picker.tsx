"use client";

import { useId, useMemo, useState } from "react";

import { GLYPH_LABELS, Glyph, modalityGlyph } from "@/components/ui/glyphs";
import { exerciseSections } from "@/lib/exercise-search";
import { MUSCLE_LABELS } from "@/lib/labels";
import type { ExerciseListItem } from "@/server/repositories/exercises";

type ExercisePickerProps = {
  name: string;
  exercises: ExerciseListItem[];
  /** The chosen exercise id, or "" for none. */
  value: string;
  onChange: (exerciseId: string) => void;
  error?: string;
  /**
   * Name the chosen exercise under the search (board Add fallback), where the list is long
   * enough to scroll it out of sight, and count each group.
   */
  long?: boolean;
};

/**
 * Search first, then grouped results (boards Add exercise, Add fallback): by body region when
 * nothing is typed, and by how well each exercise answers the search when something is, names
 * first. Each row is the name at the gutter and, under it, its equipment's glyph and the muscles
 * it works; the chosen one carries a check. The whole view is one scroll region, so a long
 * catalogue never becomes a list scrolling inside a sheet scrolling inside a page.
 *
 * Nothing is filtered out for being unavailable at the current gym: an exercise you cannot
 * do here is still an exercise, and the machine question is asked separately.
 */
export function ExercisePicker({
  name,
  exercises,
  value,
  onChange,
  error,
  long = false,
}: ExercisePickerProps) {
  const id = useId();
  const [query, setQuery] = useState("");
  const groups = useMemo(() => exerciseSections(exercises, query), [exercises, query]);
  const selected = exercises.find((e) => e.id === value);

  return (
    <div>
      <div className="search-box" data-filled={query ? "true" : undefined}>
        <Glyph name="search" className="glyph-20" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, muscle or equipment"
          aria-label="Search exercises"
          className="search-box-input"
          autoCapitalize="none"
          autoCorrect="off"
          enterKeyHint="search"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear the search"
            onClick={() => setQuery("")}
            className="search-box-clear"
          >
            <Glyph name="close" className="glyph-18" />
          </button>
        )}
      </div>

      {long && selected && (
        <p className="mt-2 type-meta-small text-ink-2">
          Selected:{" "}
          <span className="font-bold [overflow-wrap:anywhere] text-ink">{selected.name}</span>
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 type-meta-small font-semibold">
          {error}
        </p>
      )}

      {/* An empty catalogue and a query that matches nothing are different problems. */}
      {exercises.length === 0 ? (
        <p className="mt-3 type-meta text-ink-2">No exercises in the library.</p>
      ) : groups.length === 0 ? (
        <p className="mt-3 type-meta text-ink-2">Nothing matches “{query}”.</p>
      ) : (
        groups.map((group) => (
          <section key={group.key} aria-labelledby={`${id}-${group.key}`}>
            <h3 id={`${id}-${group.key}`} className="caption-head mt-3.5">
              {group.title}
              {long && group.key !== "name" && (
                <span className="tabular-nums"> · {group.items.length}</span>
              )}
            </h3>
            <ul>
              {group.items.map((exercise) => {
                const glyph = modalityGlyph(exercise.modality);
                const chosen = value === exercise.id;
                return (
                  <li key={exercise.id}>
                    <label className="picker-row">
                      <input
                        type="radio"
                        name={name}
                        value={exercise.id}
                        checked={chosen}
                        onChange={() => onChange(exercise.id)}
                        className="peer sr-only"
                      />
                      <span className="picker-row-text">
                        <span className="picker-row-name">{exercise.name}</span>
                        <span className="picker-row-meta">
                          {glyph && (
                            <Glyph name={glyph} label={GLYPH_LABELS[glyph]} className="glyph-16" />
                          )}
                          <span>
                            {exercise.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(", ")}
                          </span>
                        </span>
                      </span>
                      {chosen && (
                        <span aria-hidden className="picker-chosen">
                          <Glyph name="check" className="glyph-15" />
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
