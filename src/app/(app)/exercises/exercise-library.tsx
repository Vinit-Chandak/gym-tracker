"use client";

import { Search } from "@/components/ui/icons";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LinkRow, List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { exerciseSections, matchesExerciseQuery } from "@/lib/exercise-search";
import { EXERCISE_MODALITY_LABELS, MUSCLE_LABELS } from "@/lib/labels";
import type { ExerciseListItem } from "@/server/repositories/exercises";

function subtitle(exercise: ExerciseListItem): string {
  const muscles = exercise.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(", ");
  return `${EXERCISE_MODALITY_LABELS[exercise.modality]} · ${muscles}`;
}

function Rows({ items }: { items: ExerciseListItem[] }) {
  return (
    <List>
      {items.map((exercise) => (
        <li key={exercise.id}>
          <LinkRow
            prefetch="intent"
            href={`/exercises/${exercise.id}`}
            title={exercise.name}
            subtitle={subtitle(exercise)}
            badge={exercise.loadPortability === "global" ? undefined : <Badge>Per machine</Badge>}
          />
        </li>
      ))}
    </List>
  );
}

/**
 * The search cell, then the library grouped by muscle region, or ranked by the search once
 * one is typed. Filtering happens on the phone. Under the cell, one line says how much is
 * listed and offers the pen word for an exercise the library does not have.
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
  const shown = groups.reduce((count, group) => count + group.items.length, 0) + excluded.length;

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
            placeholder="Search by name, muscle or equipment"
            aria-label="Search exercises"
            className="pl-9"
            autoCapitalize="none"
            autoCorrect="off"
            enterKeyHint="search"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          <p className="font-data text-sm text-ink-muted tabular-nums">
            {shown} {shown === 1 ? "exercise" : "exercises"}
          </p>
          <LinkButton href="/exercises/new" variant="ghost" size="sm" className="-mr-3">
            Add your own exercise
          </LinkButton>
        </div>
      </div>

      {groups.length === 0 && excluded.length === 0 && (
        <p className="text-sm text-ink-muted">No exercises match “{query}”.</p>
      )}

      {groups.map((group) => (
        <Section key={group.key} title={group.title}>
          <Rows items={group.items} />
        </Section>
      ))}

      {/* Excluded exercises stay visible here; they are only kept out of new logging. */}
      {excluded.length > 0 && (
        <Section title="Excluded for now">
          <Rows items={excluded} />
        </Section>
      )}
    </div>
  );
}
