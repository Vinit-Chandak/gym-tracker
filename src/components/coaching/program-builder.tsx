"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, unstable_rethrow } from "next/navigation";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { InfoTip } from "@/components/ui/info-tip";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cycleCount, weekdayOffsets } from "@/domain/cycle-repeat";
import type { BlueprintDay, BlueprintExercise, ProgramBlueprint } from "@/domain/program-blueprint";
import type { SavedRoutineDay } from "@/domain/saved-routine";
import type { CycleRepeat } from "@/domain/types";
import { WEEKDAY_NAMES } from "@/lib/labels";
import {
  saveProgramDraftAction,
  reviewProgramDraftAction,
} from "@/server/actions/coaching-workflow";
import { coachingAction } from "./client-action";

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

/** What each way of repeating does, for the ⓘ beside Repeats. */
function repeatHint(repeats: CycleRepeat | undefined): string {
  if (repeats === undefined) return "Keeps its original schedule until you choose.";
  if (repeats === "once")
    return "Each day once, in order, with its own targets. Include rest days.";
  if (repeats === "weekly") return "The same weekdays every week; days between are rest.";
  return "These days in order, rest days included, then again.";
}

function nextWeekday(days: BlueprintDay[]): number {
  return ((days.at(-1)?.dayOfWeek ?? 0) % 7) + 1;
}

/** A copied day starts new exercise slots rather than borrowing another day's history. */
function independentExercises(exercises: BlueprintExercise[]): BlueprintExercise[] {
  return exercises.map((exercise) => {
    const copy = structuredClone(exercise);
    delete copy.lineageId;
    return copy;
  });
}

export function ProgramBuilder({
  initial,
  library,
  warmups,
  base,
  routines = [],
  preview = false,
  startRepeats = "rolling",
}: {
  initial: { id: string; revision: number; blueprint: ProgramBlueprint } | null;
  library: LibraryEntry[];
  warmups: { slug: string; name: string }[];
  base: "/welcome/programme" | "/profile/programme";
  routines?: { id: string; name: string; day: SavedRoutineDay }[];
  preview?: boolean;
  /** How a new programme runs, as New programme chose it (ADR 0058); a draft keeps its own. */
  startRepeats?: CycleRepeat;
}) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [plan, setPlan] = useState<ProgramBlueprint>(() =>
    initial
      ? {
          ...initial.blueprint,
          sport: "strength",
          days: initial.blueprint.days.map((day) => ({ ...day, includesRun: false })),
          runs: [],
        }
      : {
          blueprintVersion: 1,
          sport: "strength",
          slug: `manual-${crypto.randomUUID().slice(0, 8)}`,
          name: "",
          weeks: 8,
          notes: "",
          repeats: startRepeats,
          days: [],
          runs: [],
        },
  );
  const [draft, setDraft] = useState(
    initial ? { id: initial.id, revision: initial.revision } : null,
  );
  const [selectedDay, setSelectedDay] = useState(0);
  const [routineId, setRoutineId] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [removedDay, setRemovedDay] = useState<{ day: BlueprintDay; index: number } | null>(null);
  const busy = saving || navigating;
  // Historical schedules stay unchanged until the athlete explicitly chooses a cadence.
  const repeats = plan.repeats;
  const d = Math.min(selectedDay, Math.max(0, plan.days.length - 1));
  const day = plan.days[d];
  const dayLimit = repeats === "once" ? 364 : repeats === "weekly" ? 7 : 31;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change(patch: Partial<ProgramBlueprint>) {
    setPlan((previous) => {
      const next = { ...previous, ...patch };
      if (next.repeats === "once") next.weeks = Math.max(1, Math.ceil(next.days.length / 7));
      return next;
    });
    setDirty(true);
    setMessage(null);
    setError(null);
  }
  function dayChange(index: number, patch: Partial<BlueprintDay>) {
    change({ days: plan.days.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)) });
  }
  function appendDay(next: BlueprintDay) {
    change({ days: [...plan.days, next] });
    setSelectedDay(plan.days.length);
  }
  function reorderDay(to: number) {
    const days = [...plan.days];
    const [moved] = days.splice(d, 1);
    days.splice(to, 0, moved!);
    change({ days: days.map((entry, index) => ({ ...entry, dayIndex: index + 1 })) });
    setSelectedDay(to);
  }
  async function save(review: boolean) {
    if (preview) {
      setMessage("Preview only — no programme was saved.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await coachingAction(() =>
        saveProgramDraftAction({ ...plan, repeats }, draft?.id, draft?.revision),
      );
      if (!result.ok) throw new Error(result.error);
      setDraft({ id: result.value.id, revision: result.value.revision });
      setDirty(false);
      if (review) {
        const checked = await coachingAction(() =>
          reviewProgramDraftAction(result.value.id, result.value.revision),
        );
        if (!checked.ok) throw new Error(checked.error);
        startNavigation(() => router.push(`${base}/drafts/${result.value.id}` as Route));
      } else setMessage("Draft saved.");
    } catch (cause) {
      unstable_rethrow(cause);
      setError(cause instanceof Error ? cause.message : "Could not save the draft. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <fieldset disabled={busy} className="min-w-0 space-y-6">
        <Disclosure
          summary="Programme settings"
          meta={plan.name ? `${plan.name} · ${plan.weeks} weeks` : undefined}
          defaultOpen={!initial || Boolean(error)}
        >
          <div className="space-y-4">
            <Field label="Programme name">
              <Input
                maxLength={120}
                value={plan.name}
                onChange={(event) => change({ name: event.target.value })}
              />
            </Field>
            {/* A progressive programme is as long as its days, said under Repeats. */}
            {repeats !== "once" && (
              <Field label="Number of weeks">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={52}
                  value={plan.weeks || ""}
                  onChange={(event) => change({ weeks: Number(event.target.value) })}
                />
              </Field>
            )}
            <Field label="Programme notes" aside="Optional">
              <Textarea
                maxLength={2000}
                value={plan.notes}
                onChange={(event) => change({ notes: event.target.value })}
              />
            </Field>
          </div>
        </Disclosure>

        <section aria-labelledby="cycle-pattern" className="space-y-4">
          {/* The ⓘ beside the heading, never in it, so the heading reads as its name. */}
          <div className="flex items-center gap-1">
            <h2 id="cycle-pattern" className="text-lg font-medium">
              {repeats === "once" ? "Your sequence" : "Your cycle"}
            </h2>
            <InfoTip label={repeats === "once" ? "About your sequence" : "About your cycle"}>
              {repeats === "once"
                ? "Each day has its own targets. Finished workouts keep theirs."
                : "A change applies each time the day comes round. Finished workouts keep their targets."}
            </InfoTip>
          </div>
          <Field
            label="Repeats"
            info={repeatHint(repeats)}
            error={
              repeats === "weekly" &&
              plan.days.length > 0 &&
              plan.days.length < 7 &&
              weekdayOffsets(plan.days) === null
                ? "Choose a different weekday for each day, in the order you train."
                : undefined
            }
          >
            <Select
              value={repeats ?? ""}
              onChange={(event) => change({ repeats: event.target.value as CycleRepeat })}
            >
              {repeats === undefined && <option value="">Keep original schedule</option>}
              <option value="weekly" disabled={plan.days.length > 7}>
                Every week
              </option>
              <option value="rolling" disabled={plan.days.length > 31}>
                {plan.days.length
                  ? `Every ${plan.days.length === 1 ? "day" : `${plan.days.length} days`}`
                  : "Repeat the cycle"}
              </option>
              <option value="once">Progressive</option>
            </Select>
          </Field>
          {plan.days.length > 0 ? (
            <>
              <p className="text-sm text-ink-2">
                {repeats === "once"
                  ? `${plan.days.length} days, each followed once`
                  : `${plan.days.length} ${plan.days.length === 1 ? "day" : "days"} per cycle${plan.weeks > 0 ? ` · ${cycleCount(plan.weeks, plan.days.length, repeats)} cycles in ${plan.weeks} weeks` : ""}`}
              </p>
              <Field label="Day to edit">
                <Select value={d} onChange={(event) => setSelectedDay(Number(event.target.value))}>
                  {plan.days.map((entry, index) => (
                    <option key={index} value={index}>
                      {repeats === "once"
                        ? `Week ${Math.floor(index / 7) + 1}, day ${(index % 7) + 1}`
                        : `Day ${index + 1}`}{" "}
                      · {entry.name || "Unnamed day"} ·{" "}
                      {entry.exercises.length ? `${entry.exercises.length} exercises` : "Rest"}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          ) : (
            <p className="text-sm text-ink-2">No days yet.</p>
          )}
          <Button
            variant="secondary"
            disabled={plan.days.length >= dayLimit}
            onClick={() =>
              appendDay({
                dayIndex: plan.days.length + 1,
                dayOfWeek: nextWeekday(plan.days),
                name: `Day ${plan.days.length + 1}`,
                focus: "",
                timeNote: "",
                effortNote: "",
                notes: "",
                includesLifting: false,
                includesRun: false,
                warmupSlug: "",
                exercises: [],
              })
            }
          >
            Add a day
          </Button>
          {plan.days.length >= dayLimit && (
            <p className="text-sm text-ink-2">
              {repeats === "once"
                ? "364 days at most."
                : repeats === "weekly"
                  ? "A week holds 7 days; change Repeats for more."
                  : "31 days at most."}
            </p>
          )}
          {routines.length > 0 && (
            <Disclosure summary="Add a saved routine" variant="inline">
              <div className="space-y-3">
                <Field label="Routine to add">
                  <Select value={routineId} onChange={(event) => setRoutineId(event.target.value)}>
                    <option value="">Choose a routine</option>
                    {routines.map((routine) => (
                      <option key={routine.id} value={routine.id}>
                        {routine.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button
                  variant="secondary"
                  disabled={!routineId || plan.days.length >= dayLimit}
                  onClick={() => {
                    const routine = routines.find((entry) => entry.id === routineId)!;
                    appendDay({
                      ...routine.day,
                      name: routine.name || `Day ${plan.days.length + 1}`,
                      dayIndex: plan.days.length + 1,
                      dayOfWeek: nextWeekday(plan.days),
                      warmupSlug: warmups.some((warmup) => warmup.slug === routine.day.warmupSlug)
                        ? routine.day.warmupSlug
                        : "",
                      includesRun: false,
                      includesLifting: routine.day.exercises.length > 0,
                      exercises: independentExercises(
                        routine.day.exercises.map((entry) =>
                          "sets" in entry
                            ? entry
                            : {
                                ...emptyPrescription(
                                  library.find((exercise) => exercise.slug === entry.exerciseSlug),
                                  entry.exerciseSlug,
                                ),
                                notes: entry.notes,
                              },
                        ),
                      ),
                    });
                    setRoutineId("");
                  }}
                >
                  Add routine as a day
                </Button>
              </div>
            </Disclosure>
          )}
        </section>

        {day && (
          <section
            key={d}
            aria-label={`Edit day ${d + 1}`}
            className="space-y-4 border-t border-line pt-5"
          >
            <Field label="Day name">
              <Input
                maxLength={80}
                value={day.name}
                onChange={(event) => dayChange(d, { name: event.target.value })}
              />
            </Field>
            {repeats === "weekly" && plan.days.length < 7 && (
              <Field label="Usual weekday">
                <Select
                  value={day.dayOfWeek || ""}
                  onChange={(event) => dayChange(d, { dayOfWeek: Number(event.target.value) })}
                >
                  <option value="">Choose a weekday</option>
                  {WEEKDAY_NAMES.slice(1).map((name, index) => (
                    <option key={name} value={index + 1}>
                      {name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Disclosure summary="Day details" variant="inline">
              <div className="space-y-4">
                <Field label="Focus" aside="Optional">
                  <Input
                    maxLength={120}
                    value={day.focus}
                    onChange={(event) => dayChange(d, { focus: event.target.value })}
                  />
                </Field>
                <Field label="Warm-up" aside="Optional">
                  <Select
                    value={day.warmupSlug}
                    onChange={(event) => dayChange(d, { warmupSlug: event.target.value })}
                  >
                    <option value="">No warm-up</option>
                    {warmups.map((warmup) => (
                      <option key={warmup.slug} value={warmup.slug}>
                        {warmup.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Time" aside="Optional">
                  <Input
                    maxLength={120}
                    value={day.timeNote}
                    onChange={(event) => dayChange(d, { timeNote: event.target.value })}
                  />
                </Field>
                <Field label="Effort" aside="Optional">
                  <Input
                    maxLength={120}
                    value={day.effortNote}
                    onChange={(event) => dayChange(d, { effortNote: event.target.value })}
                  />
                </Field>
                <Field label="Day notes" aside="Optional">
                  <Textarea
                    maxLength={500}
                    value={day.notes}
                    onChange={(event) => dayChange(d, { notes: event.target.value })}
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" disabled={d === 0} onClick={() => reorderDay(d - 1)}>
                    Move day earlier
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={d === plan.days.length - 1}
                    onClick={() => reorderDay(d + 1)}
                  >
                    Move day later
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={plan.days.length >= dayLimit}
                    onClick={() =>
                      appendDay({
                        ...structuredClone(day),
                        name: `${day.name.slice(0, 73)} (copy)`,
                        dayIndex: plan.days.length + 1,
                        dayOfWeek: nextWeekday(plan.days),
                        exercises: independentExercises(day.exercises),
                      })
                    }
                  >
                    Duplicate day
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setRemovedDay({ day, index: d });
                      change({
                        days: plan.days
                          .filter((_, index) => index !== d)
                          .map((entry, index) => ({ ...entry, dayIndex: index + 1 })),
                      });
                      setSelectedDay(Math.max(0, d - 1));
                    }}
                  >
                    Remove day
                  </Button>
                </div>
              </div>
            </Disclosure>
            <div className="space-y-5">
              {day.exercises.map((entry, index) => (
                <ExerciseEditor
                  key={`${entry.lineageId ?? entry.exerciseSlug}:${index}`}
                  entry={entry}
                  name={
                    library.find((exercise) => exercise.slug === entry.exerciseSlug)?.name ??
                    entry.exerciseSlug
                  }
                  first={index === 0}
                  repeated={repeats !== "once"}
                  onChange={(patch) =>
                    dayChange(d, {
                      exercises: day.exercises.map((exercise, i) =>
                        i === index ? { ...exercise, ...patch } : exercise,
                      ),
                    })
                  }
                  onMove={() => {
                    const exercises = [...day.exercises];
                    [exercises[index - 1], exercises[index]] = [
                      exercises[index]!,
                      exercises[index - 1]!,
                    ];
                    dayChange(d, { exercises });
                  }}
                  onRemove={() => {
                    const exercises = day.exercises.filter((_, i) => i !== index);
                    dayChange(d, { exercises, includesLifting: exercises.length > 0 });
                  }}
                />
              ))}
            </div>
            {!day.exercises.length && <p className="text-sm text-ink-2">Rest day</p>}
            <AddExercise
              library={library}
              onAdd={(entry) =>
                dayChange(d, { includesLifting: true, exercises: [...day.exercises, entry] })
              }
            />
          </section>
        )}
        {removedDay && (
          <div className="flex flex-wrap items-center gap-2" role="status">
            <p className="text-sm">Removed “{removedDay.day.name}”.</p>
            <Button
              variant="ghost"
              disabled={plan.days.length >= dayLimit}
              onClick={() => {
                const days = [...plan.days];
                const index = Math.min(removedDay.index, days.length);
                days.splice(index, 0, removedDay.day);
                change({ days: days.map((entry, i) => ({ ...entry, dayIndex: i + 1 })) });
                setSelectedDay(index);
                setRemovedDay(null);
              }}
            >
              Undo remove day
            </Button>
          </div>
        )}
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-ink-2">
          {message}
        </p>
      )}
      <div className="sticky-actions flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => save(true)}>
          {busy ? "Saving…" : "Review programme"}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => save(false)}>
          Save draft
        </Button>
      </div>
    </div>
  );
}

function ExerciseEditor({
  entry,
  name,
  first,
  repeated,
  onChange,
  onMove,
  onRemove,
}: {
  entry: BlueprintExercise;
  name: string;
  first: boolean;
  repeated: boolean;
  onChange: (patch: Partial<BlueprintExercise>) => void;
  onMove: () => void;
  onRemove: () => void;
}) {
  const measure = entry.reps ? "reps" : entry.duration ? "duration" : "distance";
  const [confirmRemove, setConfirmRemove] = useState(false);
  return (
    <fieldset className="min-w-0 space-y-3 border-b border-line pb-5">
      <legend className="mb-3 text-lg font-medium [overflow-wrap:break-word]">{name}</legend>
      <div className="adaptive-grid">
        <Field label="Sets">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            value={entry.sets}
            onChange={(event) => onChange({ sets: Number(event.target.value) })}
          />
        </Field>
        <Field label="Count each set in">
          <Select
            value={measure}
            onChange={(event) =>
              onChange({
                reps: event.target.value === "reps" ? [NaN, NaN] : undefined,
                duration: event.target.value === "duration" ? [NaN, NaN] : undefined,
                distance: event.target.value === "distance" ? [NaN, NaN] : undefined,
              })
            }
          >
            <option value="reps">Reps</option>
            <option value="duration">Seconds</option>
            <option value="distance">Metres</option>
          </Select>
        </Field>
      </div>
      <RangeFields
        label={measure === "reps" ? "Reps" : measure === "duration" ? "Seconds" : "Metres"}
        value={entry[measure] ?? [NaN, NaN]}
        onChange={(range) => onChange({ [measure]: range })}
      />
      <Disclosure summary="Rest, effort and progression" variant="inline">
        <div className="space-y-4">
          <RangeFields
            label="Rest seconds"
            legend="Rest (s)"
            value={entry.rest}
            onChange={(rest) => onChange({ rest })}
          />
          <label className="flex min-h-[var(--ov-target)] items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-5 shrink-0"
              checked={entry.rir !== null}
              onChange={(event) => onChange({ rir: event.target.checked ? [2, 2] : null })}
            />
            Set a reps-in-reserve target
          </label>
          {entry.rir && (
            <RangeFields label="RIR" value={entry.rir} onChange={(rir) => onChange({ rir })} />
          )}
          <label className="flex min-h-[var(--ov-target)] items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-5 shrink-0"
              checked={entry.perSide ?? false}
              onChange={(event) => onChange({ perSide: event.target.checked })}
            />
            Per side
          </label>
          <Field label="Superset" aside="Optional">
            <Input
              maxLength={60}
              value={entry.supersetGroup ?? ""}
              placeholder="For example, A…"
              onChange={(event) => onChange({ supersetGroup: event.target.value || undefined })}
            />
          </Field>
          <Field label="Load note" aside="Optional">
            <Textarea
              maxLength={300}
              value={entry.targetLoadNote ?? ""}
              onChange={(event) => onChange({ targetLoadNote: event.target.value })}
            />
          </Field>
          <Field label="Progression notes" aside="Optional">
            <Textarea
              maxLength={500}
              value={entry.progressionNotes ?? ""}
              onChange={(event) => onChange({ progressionNotes: event.target.value })}
            />
          </Field>
          <Field label="Exercise notes" aside="Optional">
            <Textarea
              maxLength={500}
              value={entry.notes ?? ""}
              onChange={(event) => onChange({ notes: event.target.value })}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" disabled={first} onClick={onMove}>
              Move exercise up
            </Button>
            <Button variant="ghost" onClick={() => setConfirmRemove(true)}>
              Remove exercise
            </Button>
          </div>
          {confirmRemove && (
            <div className="space-y-2">
              <p className="text-sm">
                Remove {name} from this day{repeated ? " and its future repeats" : ""}?
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="danger" onClick={onRemove}>
                  Remove from day
                </Button>
                <Button variant="ghost" onClick={() => setConfirmRemove(false)}>
                  Keep exercise
                </Button>
              </div>
            </div>
          )}
        </div>
      </Disclosure>
    </fieldset>
  );
}

/**
 * A range under one legend ("Reps", "Rest (s)", "RIR") with "From" and "To" under it, each named
 * whole for a screen reader ("Reps from"), so the legend is not printed three times.
 */
function RangeFields({
  label,
  legend = label,
  value,
  onChange,
}: {
  label: string;
  legend?: string;
  value: [number, number];
  onChange: (value: [number, number]) => void;
}) {
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="adaptive-grid">
        <Field label="From">
          <Input
            aria-label={`${label} from`}
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={Number.isFinite(value[0]) ? value[0] : ""}
            onChange={(event) => onChange([event.target.valueAsNumber, value[1]])}
          />
        </Field>
        <Field label="To">
          <Input
            aria-label={`${label} to`}
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={Number.isFinite(value[1]) ? value[1] : ""}
            onChange={(event) => onChange([value[0], event.target.valueAsNumber])}
          />
        </Field>
      </div>
    </fieldset>
  );
}

function AddExercise({
  library,
  onAdd,
}: {
  library: LibraryEntry[];
  onAdd: (entry: BlueprintExercise) => void;
}) {
  const [query, setQuery] = useState("");
  const [slug, setSlug] = useState("");
  return (
    <div className="space-y-3 border-t border-line pt-4">
      <Field label="Find an exercise">
        <Input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSlug("");
          }}
        />
      </Field>
      <Field label="Exercise to add">
        <Select value={slug} onChange={(event) => setSlug(event.target.value)}>
          <option value="">Choose an exercise</option>
          {library
            .filter((entry) => entry.name.toLowerCase().includes(query.toLowerCase()))
            .map((entry) => (
              <option key={entry.slug} value={entry.slug}>
                {entry.name}
              </option>
            ))}
        </Select>
      </Field>
      <Button
        variant="secondary"
        disabled={!slug}
        onClick={() => {
          onAdd(
            emptyPrescription(
              library.find((entry) => entry.slug === slug),
              slug,
            ),
          );
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
