"use client";
import { coachingAction } from "./client-action";
import { useState } from "react";
import { useRouter, unstable_rethrow } from "next/navigation";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea, INPUT_CLASS } from "@/components/ui/input";
import {
  type BlueprintDay,
  type BlueprintExercise,
  type BlueprintRun,
  type ProgramBlueprint,
} from "@/domain/program-blueprint";
import {
  saveProgramDraftAction,
  reviewProgramDraftAction,
} from "@/server/actions/coaching-workflow";
import { saveRoutineAction } from "@/server/actions/manual-training";
import { WEEKDAYS } from "./intake-form";

type LibraryEntry = {
  slug: string;
  name: string;
  defaultPrescriptionType: "reps" | "duration" | "distance";
  defaultRepMin: number | null;
  defaultRepMax: number | null;
  defaultDurationMinSeconds: number | null;
  defaultDurationMaxSeconds: number | null;
  defaultDistanceMinMeters: number | null;
  defaultDistanceMaxMeters: number | null;
  defaultRir: number | null;
  defaultRestSeconds: number | null;
};
export function ProgramBuilder({
  initial,
  library,
  warmups,
  base,
  routines = [],
}: {
  initial: { id: string; revision: number; blueprint: ProgramBlueprint } | null;
  library: LibraryEntry[];
  warmups: { slug: string; name: string }[];
  base: "/welcome/programme" | "/settings/programme";
  routines?: { id: string; name: string; day: import("@/domain/saved-routine").SavedRoutineDay }[];
}) {
  const router = useRouter();
  const [routineId, setRoutineId] = useState("");
  const [plan, setPlan] = useState<ProgramBlueprint>(
    () =>
      initial?.blueprint ?? {
        blueprintVersion: 1,
        slug: `manual-${crypto.randomUUID().slice(0, 8)}`,
        name: "",
        weeks: 0,
        notes: "",
        days: [],
        runs: [],
      },
  );
  const [draft, setDraft] = useState(
      initial ? { id: initial.id, revision: initial.revision } : null,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState<string | null>(null);
  function change(patch: Partial<ProgramBlueprint>) {
    setPlan((p) => ({ ...p, ...patch }));
    setMessage(null);
    setError(null);
  }
  function dayChange(index: number, patch: Partial<BlueprintDay>) {
    change({ days: plan.days.map((day, i) => (i === index ? { ...day, ...patch } : day)) });
  }
  function exerciseChange(d: number, e: number, patch: Partial<BlueprintExercise>) {
    dayChange(d, {
      exercises: plan.days[d]!.exercises.map((entry, i) =>
        i === e ? { ...entry, ...patch } : entry,
      ),
    });
  }
  function weeksChange(weeks: number) {
    change({
      weeks,
      runs: plan.days
        .filter((day) => day.includesRun)
        .flatMap((day) =>
          Array.from(
            { length: Math.max(0, Math.min(52, weeks)) },
            (_, i) =>
              plan.runs.find((r) => r.weekIndex === i + 1 && r.dayOfWeek === day.dayOfWeek) ??
              emptyRun(i + 1, day.dayOfWeek),
          ),
        ),
    });
  }
  async function save(preview: boolean) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await coachingAction(() =>
        saveProgramDraftAction(plan, draft?.id, draft?.revision),
      );
      if (!result.ok) throw new Error(result.error);
      setDraft({ id: result.value.id, revision: result.value.revision });
      if (preview) {
        const checked = await coachingAction(() =>
          reviewProgramDraftAction(result.value.id, result.value.revision),
        );
        if (!checked.ok) throw new Error(checked.error);
        router.push(`${base}/drafts/${result.value.id}` as Route);
      } else setMessage("Draft saved. You can return to it from Programme.");
    } catch (e) {
      unstable_rethrow(e);
      setError(e instanceof Error ? e.message : "Could not save the draft.");
    } finally {
      setBusy(false);
    }
  }
  function reorderDay(from: number, to: number) {
    const days = [...plan.days];
    const [day] = days.splice(from, 1);
    days.splice(to, 0, day!);
    change({ days: days.map((d, i) => ({ ...d, dayIndex: i + 1 })) });
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-medium">
        {initial ? "Edit your programme draft" : "Build your programme"}
      </h1>
      <p className="text-sm text-ink-muted">
        Set your own training days and targets. Preview the complete programme before starting it.
      </p>
      <Card>
        <Field label="Programme name">
          <Input
            maxLength={120}
            value={plan.name}
            onChange={(e) => change({ name: e.target.value })}
          />
        </Field>
        <Field label="Number of weeks">
          <Input
            type="number"
            min={1}
            max={52}
            value={plan.weeks || ""}
            onChange={(e) => weeksChange(Number(e.target.value))}
          />
        </Field>
        <Field label="Programme notes">
          <Textarea
            maxLength={2000}
            value={plan.notes}
            onChange={(e) => change({ notes: e.target.value })}
          />
        </Field>
      </Card>
      {plan.days.map((day, d) => (
        <Card key={d}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-medium">Day {d + 1}</h2>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={d === 0}
                aria-label={`Move day ${d + 1} up`}
                onClick={() => reorderDay(d, d - 1)}
              >
                ↑
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={d === plan.days.length - 1}
                aria-label={`Move day ${d + 1} down`}
                onClick={() => reorderDay(d, d + 1)}
              >
                ↓
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  change({
                    days: plan.days
                      .filter((_, i) => i !== d)
                      .map((entry, i) => ({ ...entry, dayIndex: i + 1 })),
                    runs: plan.runs.filter((r) => r.dayOfWeek !== day.dayOfWeek),
                  })
                }
              >
                Remove day
              </Button>
            </div>
          </div>
          <Field label="Day name">
            <Input
              maxLength={80}
              value={day.name}
              onChange={(e) => dayChange(d, { name: e.target.value })}
            />
          </Field>
          <Field label="Usual weekday">
            <select
              className={INPUT_CLASS}
              value={day.dayOfWeek || ""}
              onChange={(e) => {
                const dayOfWeek = Number(e.target.value);
                change({
                  days: plan.days.map((entry, i) => (i === d ? { ...entry, dayOfWeek } : entry)),
                  runs: plan.runs.map((r) =>
                    r.dayOfWeek === day.dayOfWeek ? { ...r, dayOfWeek } : r,
                  ),
                });
              }}
            >
              <option value="">Choose a weekday</option>
              {WEEKDAYS.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Focus">
            <Input
              maxLength={120}
              value={day.focus}
              onChange={(e) => dayChange(d, { focus: e.target.value })}
            />
          </Field>
          <Field label="Warm-up (optional)">
            <select
              className={INPUT_CLASS}
              value={day.warmupSlug}
              onChange={(e) => dayChange(d, { warmupSlug: e.target.value })}
            >
              <option value="">No warm-up</option>
              {warmups.map((w) => (
                <option key={w.slug} value={w.slug}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Time available / notes">
            <Input
              maxLength={120}
              value={day.timeNote}
              onChange={(e) => dayChange(d, { timeNote: e.target.value })}
            />
          </Field>
          <Field label="Day notes">
            <Textarea
              maxLength={500}
              value={day.notes}
              onChange={(e) => dayChange(d, { notes: e.target.value })}
            />
          </Field>
          {day.exercises.map((entry, e) => (
            <fieldset key={e} className="space-y-3 rounded-control border border-line p-3">
              <legend className="px-1 font-medium">
                {library.find((x) => x.slug === entry.exerciseSlug)?.name ?? entry.exerciseSlug}
              </legend>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sets">
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={entry.sets}
                    onChange={(event) => exerciseChange(d, e, { sets: Number(event.target.value) })}
                  />
                </Field>
                <Field label="Count each set in">
                  <select
                    className={INPUT_CLASS}
                    value={entry.reps ? "reps" : entry.duration ? "duration" : "distance"}
                    onChange={(event) => {
                      const measure = event.target.value;
                      exerciseChange(d, e, {
                        reps: measure === "reps" ? [NaN, NaN] : undefined,
                        duration: measure === "duration" ? [NaN, NaN] : undefined,
                        distance: measure === "distance" ? [NaN, NaN] : undefined,
                      });
                    }}
                  >
                    <option value="reps">Reps</option>
                    <option value="duration">Seconds</option>
                    <option value="distance">Metres</option>
                  </select>
                </Field>
                {(
                  [
                    entry.reps ? "reps" : entry.duration ? "duration" : "distance",
                    "rir",
                    "rest",
                  ] as const
                )
                  .filter((key) => key !== "rir" || entry.rir !== null)
                  .map((key) => (
                    <RangeFields
                      key={key}
                      label={
                        key === "rir"
                          ? "RIR"
                          : key === "rest"
                            ? "Rest seconds"
                            : key === "reps"
                              ? "Reps"
                              : key === "duration"
                                ? "Seconds"
                                : "Metres"
                      }
                      value={entry[key as "reps"] ?? [NaN, NaN]}
                      onChange={(range) => exerciseChange(d, e, { [key]: range })}
                    />
                  ))}
              </div>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={entry.rir !== null}
                  onChange={(event) =>
                    exerciseChange(d, e, { rir: event.target.checked ? [NaN, NaN] : null })
                  }
                />
                Set a reps-in-reserve target (optional)
              </label>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={entry.perSide ?? false}
                  onChange={(event) => exerciseChange(d, e, { perSide: event.target.checked })}
                />
                Perform each set on both sides
              </label>
              <Field label="Superset group (optional)">
                <Input
                  maxLength={60}
                  value={entry.supersetGroup ?? ""}
                  placeholder="Give paired exercises the same label"
                  onChange={(event) =>
                    exerciseChange(d, e, { supersetGroup: event.target.value || undefined })
                  }
                />
              </Field>
              <Field label="Load / calibration guidance">
                <Textarea
                  maxLength={300}
                  value={entry.targetLoadNote ?? ""}
                  onChange={(event) => exerciseChange(d, e, { targetLoadNote: event.target.value })}
                />
              </Field>
              <Field label="Exercise notes">
                <Textarea
                  maxLength={500}
                  value={entry.notes ?? ""}
                  onChange={(event) => exerciseChange(d, e, { notes: event.target.value })}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={e === 0}
                  onClick={() => {
                    const entries = [...day.exercises];
                    [entries[e - 1], entries[e]] = [entries[e]!, entries[e - 1]!];
                    dayChange(d, { exercises: entries });
                  }}
                >
                  Move up
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const entries = day.exercises.filter((_, i) => i !== e);
                    dayChange(d, { exercises: entries, includesLifting: entries.length > 0 });
                  }}
                >
                  Remove exercise
                </Button>
              </div>
            </fieldset>
          ))}
          <AddExercise
            library={library}
            onAdd={(entry) =>
              dayChange(d, { includesLifting: true, exercises: [...day.exercises, entry] })
            }
          />
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              className="size-5"
              checked={day.includesRun}
              onChange={(e) =>
                change({
                  days: plan.days.map((entry, i) =>
                    i === d ? { ...entry, includesRun: e.target.checked } : entry,
                  ),
                  runs: e.target.checked
                    ? [
                        ...plan.runs,
                        ...Array.from({ length: plan.weeks }, (_, i) =>
                          emptyRun(i + 1, day.dayOfWeek),
                        ),
                      ]
                    : plan.runs.filter((r) => r.dayOfWeek !== day.dayOfWeek),
                })
              }
            />
            Include a run
          </label>
          {day.includesRun && (
            <details open>
              <summary className="min-h-11 cursor-pointer py-2">Running targets by week</summary>
              <div className="space-y-3">
                {plan.runs
                  .filter((r) => r.dayOfWeek === day.dayOfWeek)
                  .map((run) => (
                    <fieldset key={run.weekIndex} className="space-y-3 border-t border-line pt-3">
                      <legend>Week {run.weekIndex}</legend>
                      <div className="grid grid-cols-2 gap-3">
                        <RangeFields
                          label="Kilometres"
                          value={run.distanceKm ?? [NaN, NaN]}
                          onChange={(distanceKm) =>
                            change({
                              runs: plan.runs.map((r) =>
                                r === run
                                  ? {
                                      ...r,
                                      // Both ends cleared means the run is set by time alone.
                                      distanceKm: distanceKm.every(
                                        (value) => !Number.isFinite(value),
                                      )
                                        ? undefined
                                        : distanceKm,
                                    }
                                  : r,
                              ),
                            })
                          }
                        />
                        <RangeFields
                          label="Minutes"
                          value={run.duration}
                          onChange={(duration) =>
                            change({
                              runs: plan.runs.map((r) => (r === run ? { ...r, duration } : r)),
                            })
                          }
                        />
                        <RangeFields
                          label="RPE"
                          value={run.rpe}
                          onChange={(rpe) =>
                            change({ runs: plan.runs.map((r) => (r === run ? { ...r, rpe } : r)) })
                          }
                        />
                      </div>
                      <Field label="Pace / effort guidance">
                        <Input
                          maxLength={300}
                          value={run.paceNote}
                          onChange={(e) =>
                            change({
                              runs: plan.runs.map((r) =>
                                r === run ? { ...r, paceNote: e.target.value } : r,
                              ),
                            })
                          }
                        />
                      </Field>
                    </fieldset>
                  ))}
              </div>
            </details>
          )}
          {!day.includesLifting && !day.includesRun && (
            <p className="text-sm text-ink-muted">This is a rest / mobility day.</p>
          )}
          {day.exercises.length > 0 && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const result = await coachingAction(() => saveRoutineAction(day.name, day));
                setBusy(false);
                if (result.ok) setMessage(`Saved “${day.name}” to your routines.`);
                else setError(result.error);
              }}
            >
              Save this day as a routine
            </Button>
          )}
        </Card>
      ))}
      <Button
        variant="secondary"
        disabled={plan.days.length >= 31}
        onClick={() =>
          change({
            days: [
              ...plan.days,
              {
                dayIndex: plan.days.length + 1,
                dayOfWeek: 0,
                name: "",
                focus: "",
                timeNote: "",
                effortNote: "",
                notes: "",
                includesLifting: false,
                includesRun: false,
                warmupSlug: "",
                exercises: [],
              },
            ],
          })
        }
      >
        Add a day
      </Button>
      {routines.length > 0 && (
        <Card>
          <Field label="Use a saved routine as a programme day">
            <select
              className={INPUT_CLASS}
              value={routineId}
              onChange={(event) => setRoutineId(event.target.value)}
            >
              <option value="">Choose a routine</option>
              {routines.map((routine) => (
                <option key={routine.id} value={routine.id}>
                  {routine.name}
                </option>
              ))}
            </select>
          </Field>
          <Button
            variant="secondary"
            disabled={!routineId || plan.days.length >= 31}
            onClick={() => {
              const routine = routines.find((entry) => entry.id === routineId)!;
              change({
                days: [
                  ...plan.days,
                  {
                    ...routine.day,
                    dayIndex: plan.days.length + 1,
                    dayOfWeek: 0,
                    warmupSlug: warmups.some((warmup) => warmup.slug === routine.day.warmupSlug)
                      ? routine.day.warmupSlug
                      : "",
                    includesRun: false,
                    exercises: routine.day.exercises.map((entry) =>
                      "sets" in entry
                        ? entry
                        : emptyPrescription(
                            library.find((exercise) => exercise.slug === entry.exerciseSlug)!,
                            entry.exerciseSlug,
                          ),
                    ),
                  },
                ],
              });
              setRoutineId("");
            }}
          >
            Add routine as a day
          </Button>
        </Card>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-ink-muted">
          {message}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" disabled={busy} onClick={() => save(false)}>
          Save draft
        </Button>
        <Button disabled={busy} onClick={() => save(true)}>
          {busy ? "Saving…" : "Preview programme"}
        </Button>
      </div>
    </div>
  );
}
function emptyRun(weekIndex: number, dayOfWeek: number): BlueprintRun {
  return {
    weekIndex,
    dayOfWeek,
    duration: [NaN, NaN],
    rpe: [NaN, NaN],
    paceNote: "",
    progressionNote: "",
    shinRule: "",
  };
}
function RangeFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: [number, number];
  onChange: (value: [number, number]) => void;
}) {
  return (
    <div className="col-span-2 grid grid-cols-2 gap-3">
      <Field label={`${label} minimum`}>
        <Input
          type="number"
          min={0}
          step="any"
          value={Number.isFinite(value[0]) ? value[0] : ""}
          onChange={(e) => onChange([e.target.valueAsNumber, value[1]])}
        />
      </Field>
      <Field label={`${label} maximum`}>
        <Input
          type="number"
          min={0}
          step="any"
          value={Number.isFinite(value[1]) ? value[1] : ""}
          onChange={(e) => onChange([value[0], e.target.valueAsNumber])}
        />
      </Field>
    </div>
  );
}
function AddExercise({
  library,
  onAdd,
}: {
  library: LibraryEntry[];
  onAdd: (entry: BlueprintExercise) => void;
}) {
  const [query, setQuery] = useState(""),
    [slug, setSlug] = useState("");
  return (
    <div className="space-y-3 border-t border-line pt-3">
      <Field label="Find an exercise">
        <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
      </Field>
      <Field label="Exercise to add">
        <select className={INPUT_CLASS} value={slug} onChange={(e) => setSlug(e.target.value)}>
          <option value="">Choose an exercise</option>
          {library
            .filter((e) => e.name.toLowerCase().includes(query.toLowerCase()))
            .map((e) => (
              <option key={e.slug} value={e.slug}>
                {e.name}
              </option>
            ))}
        </select>
      </Field>
      <Button
        variant="secondary"
        disabled={!slug}
        onClick={() => {
          const e = library.find((entry) => entry.slug === slug)!;
          onAdd(emptyPrescription(e, slug));
          setSlug("");
        }}
      >
        Add exercise
      </Button>
    </div>
  );
}
function emptyPrescription(exercise: LibraryEntry | undefined, slug: string): BlueprintExercise {
  const measure = exercise?.defaultPrescriptionType ?? "reps";
  return {
    exerciseSlug: slug,
    sets: 1,
    reps:
      measure === "reps"
        ? [exercise?.defaultRepMin ?? NaN, exercise?.defaultRepMax ?? NaN]
        : undefined,
    duration:
      measure === "duration"
        ? [exercise?.defaultDurationMinSeconds ?? NaN, exercise?.defaultDurationMaxSeconds ?? NaN]
        : undefined,
    distance:
      measure === "distance"
        ? [exercise?.defaultDistanceMinMeters ?? NaN, exercise?.defaultDistanceMaxMeters ?? NaN]
        : undefined,
    rir: exercise?.defaultRir == null ? null : [exercise.defaultRir, exercise.defaultRir],
    rest: [exercise?.defaultRestSeconds ?? NaN, exercise?.defaultRestSeconds ?? NaN],
  };
}
