"use client";
import { coachingAction } from "./client-action";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Glyph } from "@/components/ui/glyphs";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { SavedRoutineDay } from "@/domain/saved-routine";
import { setLengthIn, SET_LENGTH_WORDS, type SetLengthUnit } from "@/lib/distance-units";
import { startRoutineAction, saveWorkoutRoutineAction } from "@/server/actions/manual-training";
/** What a routine is started beside: a programme under way, or none to change. */
export type RoutineProgramme = "ongoing" | "none";

/**
 * The saved routines, each started at the gym chosen above them: the athlete's default gym
 * from the start, as Today starts a workout there, or the only gym they have. "Choose a
 * location" is asked only when there is no such gym. The line above them speaks of a
 * programme only while one is under way.
 */
export function RoutineLibrary({
  routines,
  gyms,
  library,
  programme = "ongoing",
  length,
}: {
  routines: { id: string; name: string; day: SavedRoutineDay }[];
  gyms: { id: string; name: string; isDefault?: boolean }[];
  library: { slug: string; name: string }[];
  /** What a carry's range reads in: the athlete's metres or yards (ADR 0056). */
  length: SetLengthUnit;
  programme?: RoutineProgramme;
}) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [gymId, setGymId] = useState(
      () => gyms.find((gym) => gym.isDefault)?.id ?? (gyms.length === 1 ? gyms[0]!.id : ""),
    ),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<string | null>(null);
  const busy = saving || navigating;
  return (
    <div className="space-y-4">
      {/* The page's header titles it; each routine below is a heading under that. */}
      <p className="text-sm text-ink-muted">
        {programme === "ongoing"
          ? "Start a repeatable workout without changing your active programme."
          : "Start a repeatable workout."}{" "}
        Completed workouts and sets stay in history.
      </p>
      <Field label="Where will you train?">
        <Select value={gymId} onChange={(e) => setGymId(e.target.value)}>
          {gymId === "" && <option value="">Choose a location</option>}
          {gyms.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      </Field>
      {routines.map((routine) => (
        <Card key={routine.id}>
          <h2 className="text-lg font-medium [overflow-wrap:break-word]">{routine.name}</h2>
          <ol className="space-y-2 text-sm [overflow-wrap:break-word]">
            {routine.day.exercises.map((entry, i) => (
              <li key={i}>
                {library.find((e) => e.slug === entry.exerciseSlug)?.name ?? entry.exerciseSlug}
                {"sets" in entry && (
                  <p className="text-ink-muted">
                    {entry.sets} ×{" "}
                    {(
                      entry.reps ??
                      entry.duration ??
                      entry.distance?.map((metres) => setLengthIn(metres, length))
                    )?.join("–")}{" "}
                    {entry.reps ? "reps" : entry.duration ? "seconds" : SET_LENGTH_WORDS[length]}
                  </p>
                )}
              </li>
            ))}
          </ol>
          <Button
            disabled={busy || !gymId}
            onClick={async () => {
              setSaving(true);
              setError(null);
              const result = await coachingAction(() => startRoutineAction(routine.id, gymId));
              if (result.ok)
                startNavigation(() => router.push(`/workouts/${result.value.sessionId}` as Route));
              else setError(result.error);
              setSaving(false);
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
      <LinkButton href="/profile/programme/manual" variant="secondary">
        Build a routine or programme
      </LinkButton>
    </div>
  );
}
export function SaveWorkoutRoutine({ sessionId, name }: { sessionId: string; name: string }) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [title, setTitle] = useState(name),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<string | null>(null);
  const busy = saving || navigating;
  return (
    // Board Summary: a row that opens, led by its glyph, the routine's name and Save under it.
    <details className="disclosure">
      <summary className="disclosure-summary">
        <span className="mark-cell">
          <Glyph name="repeat" className="glyph-20" />
        </span>
        <span className="min-w-0 flex-1 font-bold">Save or repeat this workout</span>
        <Glyph name="chevronDown" className="disclosure-chevron glyph-18" />
      </summary>
      <div className="space-y-3 pb-4">
        <Field label="Routine name">
          <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <p className="type-meta-small text-ink-2">
          Save the exercises and known targets. No completed sets are copied into a new workout.
        </p>
        <Button
          disabled={busy || !title.trim()}
          onClick={async () => {
            setSaving(true);
            const result = await coachingAction(() => saveWorkoutRoutineAction(sessionId, title));
            if (result.ok) startNavigation(() => router.push("/profile/routines"));
            else setError(result.error);
            setSaving(false);
          }}
        >
          Save routine and choose a gym
        </Button>
        {error && (
          <p role="alert" className="type-meta-small font-semibold">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
