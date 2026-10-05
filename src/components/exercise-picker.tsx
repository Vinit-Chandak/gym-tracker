"use client";

import { useId, useMemo, useRef, useState } from "react";

import { GLYPH_LABELS, Glyph, modalityGlyph } from "@/components/ui/glyphs";
import { exerciseSections } from "@/lib/exercise-search";
import { MUSCLE_LABELS } from "@/lib/labels";
import { holdEnter } from "@/lib/search-keys";
import type { ExerciseListItem } from "@/server/repositories/exercises";

type SingleChoice = {
  mode?: "single";
  name: string;
  /** The chosen exercise id, or "" for none. */
  value: string;
  onChange: (exerciseId: string) => void;
  /**
   * Name the chosen exercise under the search (board Add fallback), where the list is long
   * enough to scroll it out of sight, and count each group.
   */
  long?: boolean;
};

/**
 * Several at once (plan: "Add several exercises in one submission"): rows are checkboxes, and
 * the selection lives with the caller, in the order it was made, so it survives every search.
 * The checkboxes carry no name: what is chosen, and in what order, is the caller's to submit.
 */
type SeveralChoices = {
  mode: "multiple";
  /** The chosen exercise ids, in the order they were chosen. */
  selected: readonly string[];
  onToggle: (exerciseId: string) => void;
  /** A word under a row's muscles, such as "In this workout"; null for none. */
  note?: (exercise: ExerciseListItem) => string | null;
};

type ExercisePickerProps = (SingleChoice | SeveralChoices) & {
  exercises: ExerciseListItem[];
  error?: string;
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
 *
 * Choosing several, each chosen row carries its place in the order instead of a check, and
 * choosing one while the search is being typed in closes the keyboard, so the count and the
 * action pinned at the foot are in sight again.
 */
export function ExercisePicker(props: ExercisePickerProps) {
  const { exercises, error } = props;
  const several = props.mode === "multiple";
  const long = !several && (props.long ?? false);
  const id = useId();
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const groups = useMemo(() => exerciseSections(exercises, query), [exercises, query]);
  const selected = several ? undefined : exercises.find((e) => e.id === props.value);

  return (
    <div>
      <div className="search-box" data-filled={query ? "true" : undefined}>
        <Glyph name="search" className="glyph-20" />
        <input
          ref={search}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, muscle or equipment…"
          aria-label="Search exercises"
          className="search-box-input"
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          onKeyDown={holdEnter}
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

      {/* What a search found, said as well as shown. */}
      <p role="status" className="sr-only">
        {query.trim() ? searchSaid(groups, query) : ""}
      </p>

      {/* An empty catalogue and a query that matches nothing are different problems. */}
      {exercises.length === 0 ? (
        <p className="mt-3 type-meta text-ink-2">No exercises in the library.</p>
      ) : groups.length === 0 ? (
        <p className="mt-3 type-meta text-ink-2">Nothing matches “{query}”.</p>
      ) : (
        groups.map((group) => (
          <section key={group.key} aria-labelledby={`${id}-${group.key}`}>
            {/* The page's title is its h1, and nothing stands between: the groups are h2. */}
            <h2 id={`${id}-${group.key}`} className="caption-head mt-3.5">
              {group.title}
              {long && group.key !== "name" && (
                <span className="tabular-nums"> · {group.items.length}</span>
              )}
            </h2>
            <ul>
              {group.items.map((exercise) => {
                const glyph = modalityGlyph(exercise.modality);
                const place = several ? props.selected.indexOf(exercise.id) + 1 : 0;
                const chosen = several ? place > 0 : props.value === exercise.id;
                const note = several ? (props.note?.(exercise) ?? null) : null;
                return (
                  <li key={exercise.id}>
                    <label className="picker-row">
                      {several ? (
                        <input
                          type="checkbox"
                          checked={chosen}
                          onChange={() => {
                            props.onToggle(exercise.id);
                            if (document.activeElement === search.current) search.current?.blur();
                          }}
                          className="peer sr-only"
                        />
                      ) : (
                        <input
                          type="radio"
                          name={props.name}
                          value={exercise.id}
                          checked={chosen}
                          onChange={() => props.onChange(exercise.id)}
                          className="peer sr-only"
                        />
                      )}
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
                        {note && <span className="picker-row-note">{note}</span>}
                        {/* The order of picks is the order they are added in: heard as well. */}
                        {several && chosen && (
                          <span className="sr-only">, {ordinal(place)} to add</span>
                        )}
                      </span>
                      {several ? (
                        <span aria-hidden className="picker-tick" data-on={chosen || undefined}>
                          {chosen && <span className="tabular-nums">{place}</span>}
                        </span>
                      ) : (
                        chosen && (
                          <span aria-hidden className="picker-chosen">
                            <Glyph name="check" className="glyph-15" />
                          </span>
                        )
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

/** "1st", "2nd", "3rd", "11th", "22nd". */
function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10];
  return `${n}${suffix ?? "th"}`;
}

/** "12 matches", or that nothing matches. */
function searchSaid(groups: readonly { items: readonly { id: string }[] }[], query: string) {
  const found = new Set(groups.flatMap((group) => group.items.map((item) => item.id))).size;
  return found === 0
    ? `Nothing matches “${query.trim()}”`
    : `${found} ${found === 1 ? "match" : "matches"}`;
}
