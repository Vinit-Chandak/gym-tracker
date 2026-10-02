"use client";
import { coachingAction } from "./client-action";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { PlanRow } from "@/components/planned-exercises";
import { Button, LinkButton } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { EmptyState } from "@/components/ui/empty-state";
import { Repeat } from "@/components/ui/icons";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { SavedRoutineDay } from "@/domain/saved-routine";
import { startRoutineAction, saveWorkoutRoutineAction } from "@/server/actions/manual-training";

/** "3 × 8–12 reps", in the measure the exercise is counted in. */
function routineTargets(entry: SavedRoutineDay["exercises"][number]): string | null {
  if (!("sets" in entry)) return null;
  const range = entry.reps ?? entry.duration ?? entry.distance;
  const unit = entry.reps ? "reps" : entry.duration ? "seconds" : "metres";
  return `${entry.sets} × ${range?.join("–")} ${unit}`;
}

/**
 * The routines kept outside the programme, each written out as a plan, and the gym to start
 * one at. Every routine starts the same way, so none of the starts is the one highlighter;
 * they are ruled, and the screen has no primary.
 */
export function RoutineLibrary({
  routines,
  gyms,
  library,
}: {
  routines: { id: string; name: string; day: SavedRoutineDay }[];
  gyms: { id: string; name: string }[];
  library: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const [gymId, setGymId] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const names = new Map(library.map((exercise) => [exercise.slug, exercise.name]));
  return (
    <div className="space-y-[var(--section-gap)]">
      <div className="min-w-0">
        <h2 className="text-2xl">Saved routines</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Start a repeatable workout without changing your active programme. Completed workouts and
          sets stay in history.
        </p>
      </div>
      <Field label="Where will you train?">
        <Select value={gymId} onChange={(e) => setGymId(e.target.value)}>
          <option value="">Choose a location</option>
          {gyms.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      </Field>
      {routines.length > 0 ? (
        <ul className="box-rows">
          {routines.map((routine) => (
            <li key={routine.id} className="space-y-3 py-4">
              <h3 className="text-lg [overflow-wrap:anywhere]">{routine.name}</h3>
              <ol className="min-w-0 ruled-list">
                {routine.day.exercises.map((entry, i) => (
                  <PlanRow
                    key={i}
                    number={i + 1}
                    name={names.get(entry.exerciseSlug) ?? entry.exerciseSlug}
                    detail={routineTargets(entry) ?? ""}
                  />
                ))}
              </ol>
              <Button
                variant="secondary"
                className="flex w-full"
                disabled={busy || !gymId}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  const result = await coachingAction(() => startRoutineAction(routine.id, gymId));
                  if (result.ok) router.push(`/workouts/${result.value.sessionId}` as Route);
                  else setError(result.error);
                  setBusy(false);
                }}
              >
                {busy ? "Starting…" : "Start this routine"}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={Repeat}
          title="No saved routines yet"
          description="Save a day from the programme builder, or save a completed workout."
        />
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <LinkButton href="/profile/programme/manual" variant="secondary" className="flex w-full">
        Build a routine or programme
      </LinkButton>
    </div>
  );
}

/** Saving a finished workout as a routine, folded under its own summary on the workout page. */
export function SaveWorkoutRoutine({ sessionId, name }: { sessionId: string; name: string }) {
  const router = useRouter();
  const [title, setTitle] = useState(name),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  return (
    <Disclosure summary="Save or repeat this workout">
      <div className="space-y-3">
        <Field label="Routine name">
          <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <p className="text-sm text-ink-muted">
          Save the exercises and known targets. No completed sets are copied into a new workout.
        </p>
        <Button
          variant="secondary"
          className="flex w-full"
          disabled={busy || !title.trim()}
          onClick={async () => {
            setBusy(true);
            const result = await coachingAction(() => saveWorkoutRoutineAction(sessionId, title));
            if (result.ok) router.push("/profile/routines");
            else setError(result.error);
            setBusy(false);
          }}
        >
          Save routine and choose a gym
        </Button>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </Disclosure>
  );
}
