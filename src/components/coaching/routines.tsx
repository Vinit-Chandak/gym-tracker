"use client";
import { coachingAction } from "./client-action";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, INPUT_CLASS } from "@/components/ui/input";
import type { SavedRoutineDay } from "@/domain/saved-routine";
import { startRoutineAction, saveWorkoutRoutineAction } from "@/server/actions/manual-training";
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
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-medium">Saved routines</h1>
      <p className="text-sm text-ink-muted">
        Start a repeatable workout without changing your active programme. Completed workouts and
        sets stay in history.
      </p>
      <Field label="Where will you train?">
        <select className={INPUT_CLASS} value={gymId} onChange={(e) => setGymId(e.target.value)}>
          <option value="">Choose a location</option>
          {gyms.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </Field>
      {routines.map((routine) => (
        <Card key={routine.id}>
          <h2 className="text-lg font-medium">{routine.name}</h2>
          <ol className="space-y-2 text-sm">
            {routine.day.exercises.map((entry, i) => (
              <li key={i}>
                {library.find((e) => e.slug === entry.exerciseSlug)?.name ?? entry.exerciseSlug}
                {"sets" in entry && (
                  <p className="text-ink-muted">
                    {entry.sets} × {(entry.reps ?? entry.duration ?? entry.distance)?.join("–")}{" "}
                    {entry.reps ? "reps" : entry.duration ? "seconds" : "metres"}
                  </p>
                )}
              </li>
            ))}
          </ol>
          <Button
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
        </Card>
      ))}
      {!routines.length && (
        <Card>
          <p>
            No saved routines yet. Save a day from the programme builder, or save a completed
            workout.
          </p>
        </Card>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <LinkButton href="/settings/programme/manual" variant="secondary">
        Build a routine or programme
      </LinkButton>
    </div>
  );
}
export function SaveWorkoutRoutine({ sessionId, name }: { sessionId: string; name: string }) {
  const router = useRouter();
  const [title, setTitle] = useState(name),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  return (
    <details className="box panel-padding">
      <summary className="min-h-11 cursor-pointer py-2">Save or repeat this workout</summary>
      <div className="space-y-3">
        <Field label="Routine name">
          <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <p className="text-sm text-ink-muted">
          Save the exercises and known targets. No completed sets are copied into a new workout.
        </p>
        <Button
          disabled={busy || !title.trim()}
          onClick={async () => {
            setBusy(true);
            const result = await coachingAction(() => saveWorkoutRoutineAction(sessionId, title));
            if (result.ok) router.push("/settings/routines");
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
    </details>
  );
}
