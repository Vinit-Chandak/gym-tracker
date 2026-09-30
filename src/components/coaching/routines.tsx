"use client";
import { coachingAction } from "./client-action";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SportChip } from "@/components/ui/sport-chip";
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
    <div className="space-y-[var(--section-gap)]">
      {/* Where comes first: every routine below starts there, and none can start without it. */}
      <Card>
        <Field
          label="Where will you train?"
          info="A routine starts a repeatable workout without changing your active programme. Completed workouts and sets stay in history."
        >
          <Select value={gymId} onChange={(e) => setGymId(e.target.value)}>
            <option value="">Choose a location</option>
            {gyms.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>
      </Card>
      {routines.map((routine) => (
        <Card key={routine.id}>
          <div className="flex items-center gap-3">
            <SportChip sport="strength" />
            <div className="min-w-0">
              <h2 className="text-headline font-semibold [overflow-wrap:anywhere]">
                {routine.name}
              </h2>
              <p className="text-sm text-ink-muted tabular-nums">
                {routine.day.exercises.length}{" "}
                {routine.day.exercises.length === 1 ? "exercise" : "exercises"}
              </p>
            </div>
          </div>
          <ol className="space-y-2.5 [overflow-wrap:anywhere]">
            {routine.day.exercises.map((entry, i) => (
              <li key={i}>
                <p className="text-sm">
                  {library.find((e) => e.slug === entry.exerciseSlug)?.name ?? entry.exerciseSlug}
                </p>
                {"sets" in entry && (
                  <p className="mt-0.5 text-xs text-ink-muted tabular-nums">
                    {entry.sets} × {(entry.reps ?? entry.duration ?? entry.distance)?.join("–")}{" "}
                    {entry.reps ? "reps" : entry.duration ? "seconds" : "metres"}
                  </p>
                )}
              </li>
            ))}
          </ol>
          <Button
            className="w-full"
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
          <p className="text-sm text-ink-muted">
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
      <LinkButton href="/profile/programme/manual" variant="secondary" className="w-full">
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
    <Disclosure summary="Save or repeat this workout">
      <div className="space-y-3">
        <Field
          label="Routine name"
          info="Saves the exercises and known targets. No completed sets are copied into a new workout."
        >
          <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Button
          className="w-full"
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
