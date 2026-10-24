"use client";

import { Search } from "@/components/ui/icons";
import { useId, useMemo, useState } from "react";

import { Glyph, exerciseGlyph } from "@/components/ui/glyphs";
import { Input } from "@/components/ui/input";
import { NavRow } from "@/components/ui/nav-row";
import { exerciseSections, matchesExerciseQuery } from "@/lib/exercise-search";
import { holdHyphens, joinFacts } from "@/lib/facts";
import { EXERCISE_MODALITY_LABELS, LOAD_PORTABILITY_TAGS, MUSCLE_LABELS } from "@/lib/labels";
import type { ExerciseListItem } from "@/server/repositories/exercises";

/**
 * "[dumbbell] Barbell · Chest, Triceps": the equipment's glyph leads the line, as it leads every
 * exercise row's, and the equipment is still said, since the search finds it and the glyph draws
 * a barbell and a dumbbell alike. Cardio is drawn as the machine it is done on, the rowing
 * machine's as the rowing machine, and done on none (battle ropes) it is said in words alone. A
 * wrapped line breaks before the dot, never after it.
 */
function Equipment({ exercise }: { exercise: ExerciseListItem }) {
  const glyph = exerciseGlyph(exercise);
  const muscles = exercise.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(", ");
  return (
    <span className="meta-fact">
      {glyph && <Glyph name={glyph} className="glyph-16" />}
      {joinFacts([EXERCISE_MODALITY_LABELS[exercise.modality], muscles])}
    </span>
  );
}

/**
 * A group of the library, as a list to choose from draws it (DESIGN.md, Rows and marks): each
 * name at the gutter with nothing boxing it, so the name has the row's width up to the chevron.
 */
function Group({ title, items }: { title: string; items: ExerciseListItem[] }) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="group-caption">
        {title}
      </h2>
      <ul>
        {items.map((exercise) => (
          <NavRow
            key={exercise.id}
            prefetch="intent"
            href={`/exercises/${exercise.id}`}
            // "Archer push-up" breaks between its words, never at its hyphen.
            label={holdHyphens(exercise.name)}
            sub={<Equipment exercise={exercise} />}
            tag={LOAD_PORTABILITY_TAGS[exercise.loadPortability] ?? undefined}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * Search box plus the library grouped by muscle region, or ranked by the search once one is
 * typed. Filtering happens on the phone.
 */
export function ExerciseLibrary({ exercises }: { exercises: ExerciseListItem[] }) {
  const [query, setQuery] = useState("");
  const { groups, excluded } = useMemo(() => {
    return {
      groups: exerciseSections(
        exercises.filter((e) => e.isActive),
        query,
      ),
      excluded: exercises.filter((e) => !e.isActive && matchesExerciseQuery(e, query)),
    };
  }, [exercises, query]);

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle" aria-hidden />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name, muscle or equipment"
          aria-label="Search exercises"
          className="pl-9"
          autoCapitalize="none"
          autoCorrect="off"
          enterKeyHint="search"
        />
      </div>

      {groups.length === 0 && excluded.length === 0 && (
        <p className="text-sm text-ink-muted">No exercises match “{query}”.</p>
      )}

      {groups.map((group) => (
        <Group key={group.key} title={group.title} items={group.items} />
      ))}

      {/* Excluded exercises stay visible here; they are only kept out of new logging. */}
      {excluded.length > 0 && <Group title="Excluded for now" items={excluded} />}
    </div>
  );
}
