"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { LinkRow, List } from "@/components/ui/link-row";
import { SectionHeading } from "@/components/ui/section";
import { groupByRegion } from "@/domain/muscles";
import { matchesExerciseQuery } from "@/lib/exercise-search";
import { BODY_REGION_LABELS, EXERCISE_MODALITY_LABELS, MUSCLE_LABELS } from "@/lib/labels";
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

/** Search box plus the library grouped by muscle region. Filtering happens on the phone. */
export function ExerciseLibrary({ exercises }: { exercises: ExerciseListItem[] }) {
  const [query, setQuery] = useState("");
  const { groups, excluded } = useMemo(() => {
    const matching = exercises.filter((e) => matchesExerciseQuery(e, query));
    return {
      groups: groupByRegion(matching.filter((e) => e.isActive)),
      excluded: matching.filter((e) => !e.isActive),
    };
  }, [exercises, query]);

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search
          className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle"
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

      {groups.length === 0 && excluded.length === 0 && (
        <p className="px-1 text-sm text-ink-muted">No exercises match “{query}”.</p>
      )}

      {groups.map((group) => (
        <section key={group.region} className="space-y-2">
          <SectionHeading title={BODY_REGION_LABELS[group.region]} />
          <Rows items={group.items} />
        </section>
      ))}

      {excluded.length > 0 && (
        <section className="space-y-2">
          <SectionHeading title="Excluded for now" />
          <Rows items={excluded} />
        </section>
      )}
    </div>
  );
}
