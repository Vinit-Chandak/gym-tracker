"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useSyncExternalStore, useTransition } from "react";

import { coachingAction } from "@/components/coaching/client-action";
import { ExercisePicker } from "@/components/exercise-picker";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";
import { Glyph } from "@/components/ui/glyphs";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { Swap } from "@/components/ui/swap";
import { PLAN_LIMITS } from "@/domain/plan-limits";
import { formatIsoWeekdayDay } from "@/lib/format";
import type { SetupStep } from "@/lib/setup-path";
import {
  splitExercise,
  splitPrescription,
  splitProblem,
  splitToBlueprint,
  type SplitDay,
  type SplitExercise,
} from "@/lib/setup-split";
import {
  activateProgramDraftAction,
  reviewProgramDraftAction,
  saveProgramDraftAction,
} from "@/server/actions/coaching-workflow";
import type { ExerciseListItem } from "@/server/repositories/exercises";

import { OnboardingFrame } from "../../onboarding-frame";

/** Kept for this tab while setup is open, so a reload or a trip back keeps the days built. */
const STORE = "overload-setup-split";

type Stored = { days: SplitDay[]; startDate: string | null };
const FIRST: Stored = { days: [{ name: "Day 1", exercises: [] }], startDate: null };

/*
 * The split being built lives outside React, in the tab's session storage, read through
 * `useSyncExternalStore`: the server and the first render agree on an empty split, and a split
 * built before a reload comes back the moment the page is running.
 */
let memory: Stored | null = null;
const listeners = new Set<() => void>();

function loadStored(): Stored {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE) ?? "null") as Partial<Stored> | null;
    if (saved?.days && Array.isArray(saved.days) && saved.days.length > 0)
      return { days: saved.days, startDate: saved.startDate ?? null };
  } catch {
    /* Storage refused or the copy is damaged: start afresh. */
  }
  return FIRST;
}
function snapshot(): Stored {
  memory ??= loadStored();
  return memory;
}
function serverSnapshot(): Stored {
  return FIRST;
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function store(next: Stored | null) {
  memory = next ?? FIRST;
  try {
    if (next) sessionStorage.setItem(STORE, JSON.stringify(next));
    else sessionStorage.removeItem(STORE);
  } catch {
    /* Storage refused: the split still works, it just does not outlive a reload. */
  }
  for (const listener of listeners) listener();
}

const REP_RANGES: readonly [number, number][] = [
  [3, 5],
  [5, 8],
  [6, 10],
  [8, 12],
  [10, 15],
  [12, 20],
];
const RIR_RANGES: readonly [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
];
const label = ([low, high]: readonly [number, number]) => `${low}–${high}`;

/** "Bench press, overhead press, weighted dip and 1 more", or "Nothing to log". */
function dayLine(day: SplitDay): string {
  if (day.exercises.length === 0) return "Nothing to log";
  const names = day.exercises.map((exercise, i) =>
    i === 0 ? exercise.name : exercise.name.charAt(0).toLowerCase() + exercise.name.slice(1),
  );
  return names.length <= 4
    ? names.join(", ")
    : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}

/**
 * Board Your split, for someone who already trains: their days in order, each with what they do
 * on it, then the day it starts and how often it repeats; Start this split ends setup and opens
 * Today. A day opens on a screen of its own (board A day of your split): its name, its exercises
 * each with its sets, reps and reps in reserve, and Add exercises, which opens the library's own
 * search. The three screens are entries in the browser's history, so the phone's back gesture
 * steps between them, and what has been built is kept for the tab while setup is open.
 */
export function SplitBuilder({
  steps,
  library,
  today,
}: {
  steps: readonly SetupStep[];
  library: ExerciseListItem[];
  today: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [navigating, startNavigation] = useTransition();
  const built = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const days = built.days;
  const startDate = built.startDate && built.startDate >= today ? built.startDate : today;
  const setDays = (change: (current: SplitDay[]) => SplitDay[]) =>
    store({ ...snapshot(), days: change(snapshot().days) });
  const setStartDate = (date: string) => store({ ...snapshot(), startDate: date });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const busy = saving || navigating;

  const dayParam = Number(params.get("day"));
  const open =
    Number.isInteger(dayParam) && dayParam >= 1 && dayParam <= days.length ? dayParam - 1 : null;
  const adding = open !== null && params.get("add") === "1";
  const byId = useMemo(() => new Map(library.map((item) => [item.id, item])), [library]);

  const go = (search: string) => window.history.pushState(null, "", search || "?");
  const back = () => window.history.back();
  const changeDay = (index: number, patch: Partial<SplitDay>) =>
    setDays((current) => current.map((day, i) => (i === index ? { ...day, ...patch } : day)));
  const changeExercise = (dayIndex: number, at: number, patch: Partial<SplitExercise>) =>
    setDays((current) =>
      current.map((day, i) =>
        i === dayIndex
          ? {
              ...day,
              exercises: day.exercises.map((exercise, j) =>
                j === at ? { ...exercise, ...patch } : exercise,
              ),
            }
          : day,
      ),
    );

  async function start() {
    const problem = splitProblem(days);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    const blueprint = splitToBlueprint(days, startDate, crypto.randomUUID().slice(0, 8));
    const saved = await coachingAction(() => saveProgramDraftAction(blueprint));
    if (!saved.ok) {
      setError(saved.error);
      setSaving(false);
      return;
    }
    const checked = await coachingAction(() =>
      reviewProgramDraftAction(saved.value.id, saved.value.revision),
    );
    if (!checked.ok) {
      setError(checked.error);
      setSaving(false);
      return;
    }
    const started = await coachingAction(() =>
      activateProgramDraftAction({
        id: checked.value.id,
        revision: checked.value.revision,
        startDate,
        transition: "new_block",
      }),
    );
    if (!started.ok) {
      setError(started.error);
      setSaving(false);
      return;
    }
    store(null);
    startNavigation(() => router.push("/today"));
  }

  if (adding && open !== null) {
    const day = days[open]!;
    const room = PLAN_LIMITS.exercises - day.exercises.length;
    return (
      <div className="onboarding page-width">
        <header className="onboarding-head">
          <button type="button" onClick={back} className="back-link">
            <Glyph name="chevronLeft" className="glyph-22" />
            <span className="back-link-label">{day.name.trim() || `Day ${open + 1}`}</span>
          </button>
        </header>
        <h1 className="onboarding-title">Add exercises</h1>
        <div className="mt-3">
          <ExercisePicker
            mode="multiple"
            exercises={library}
            selected={picked}
            onToggle={(id) =>
              setPicked((current) =>
                current.includes(id)
                  ? current.filter((item) => item !== id)
                  : current.length < room
                    ? [...current, id]
                    : current,
              )
            }
            note={(exercise) =>
              day.exercises.some((entry) => entry.slug === exercise.slug) ? "On this day" : null
            }
          />
        </div>
        <PinnedActions stack>
          {picked.length >= room && (
            <p className="pinned-fact text-ink-2">
              {PLAN_LIMITS.exercises} is the most one day can hold.
            </p>
          )}
          <Button
            size="lg"
            className="w-full"
            variant={picked.length === 0 ? "waiting" : "primary"}
            onClick={() => {
              if (picked.length === 0) return;
              const added = picked.flatMap((id) => {
                const item = byId.get(id);
                return item ? [splitExercise(item)] : [];
              });
              changeDay(open, { exercises: [...day.exercises, ...added] });
              setPicked([]);
              back();
            }}
          >
            {picked.length === 0 ? (
              "Choose exercises to add"
            ) : (
              <span>
                Add <Swap id={String(picked.length)}>{picked.length}</Swap>
              </span>
            )}
          </Button>
        </PinnedActions>
      </div>
    );
  }

  if (open !== null) {
    const day = days[open]!;
    const exercise = editing === null ? null : (day.exercises[editing] ?? null);
    return (
      <div className="onboarding page-width">
        <header className="onboarding-head">
          <button type="button" onClick={back} className="back-link">
            <Glyph name="chevronLeft" className="glyph-22" />
            <span className="back-link-label">Your split</span>
          </button>
        </header>
        {/* The day's name is typed where the title stands; the page still says what it is. */}
        <h1 className="sr-only">
          Day {open + 1}: {day.name.trim() || (day.exercises.length > 0 ? "training" : "rest")}
        </h1>
        <label htmlFor="split-day-name" className="split-day-label">
          Day {open + 1}
        </label>
        <input
          id="split-day-name"
          type="text"
          value={day.name}
          maxLength={80}
          autoComplete="off"
          placeholder={day.exercises.length > 0 ? `Day ${open + 1}` : "Rest"}
          onChange={(event) => changeDay(open, { name: event.target.value })}
          className="split-day-name"
        />
        <ul aria-label="Exercises" className="mt-3.5">
          {day.exercises.map((entry, i) => (
            <li key={`${entry.slug}-${i}`} className="border-b border-hair">
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setEditing(i)}
                className="split-row"
              >
                <span className="min-w-0 flex-1">
                  <span className="split-row-name">{entry.name}</span>
                  <span className="split-row-figures">{splitPrescription(entry)}</span>
                </span>
                <Glyph name="chevronRight" className="glyph-18 shrink-0 text-ink-2" />
              </button>
            </li>
          ))}
        </ul>
        <Button
          variant="tonal"
          size="lg"
          className="mt-4 w-full"
          aria-haspopup="dialog"
          onClick={() => {
            setPicked([]);
            go(`?day=${open + 1}&add=1`);
          }}
        >
          <Glyph name="plus" className="glyph-20" />
          Add exercises
        </Button>
        {days.length > 1 && (
          <button
            type="button"
            onClick={() => {
              setDays((current) => current.filter((_, at) => at !== open));
              back();
            }}
            className="split-remove mt-2"
          >
            <Glyph name="trash" className="glyph-18" />
            Take this day out of the split
          </button>
        )}
        <PinnedActions stack>
          <Button size="lg" className="w-full" onClick={back}>
            Done
          </Button>
        </PinnedActions>

        <Sheet
          open={exercise !== null}
          onClose={() => setEditing(null)}
          title={exercise?.name ?? "Exercise"}
          footer={
            <Button size="lg" className="w-full" onClick={() => setEditing(null)}>
              Done
            </Button>
          }
        >
          {exercise && editing !== null && (
            <div className="space-y-5 pb-1">
              <div className="units-row">
                <span className="units-row-label">Sets</span>
                <span className="split-stepper">
                  <button
                    type="button"
                    aria-label="One set fewer"
                    disabled={exercise.sets <= 1}
                    onClick={() => changeExercise(open, editing, { sets: exercise.sets - 1 })}
                    className="round-button"
                  >
                    <Glyph name="minus" className="glyph-20" />
                  </button>
                  <span className="split-stepper-value" aria-live="polite">
                    {exercise.sets}
                  </span>
                  <button
                    type="button"
                    aria-label="One set more"
                    disabled={exercise.sets >= PLAN_LIMITS.sets}
                    onClick={() => changeExercise(open, editing, { sets: exercise.sets + 1 })}
                    className="round-button"
                  >
                    <Glyph name="plus" className="glyph-20" />
                  </button>
                </span>
              </div>
              {exercise.measure === "reps" ? (
                <>
                  <div className="space-y-2">
                    <p id="split-reps" className="units-row-label">
                      Reps
                    </p>
                    <SegmentedControl
                      name="split-reps"
                      aria-labelledby="split-reps"
                      options={REP_RANGES.map((range) => ({
                        value: label(range),
                        label: label(range),
                      }))}
                      value={label(exercise.range)}
                      onChange={(value) => {
                        const range = REP_RANGES.find((option) => label(option) === value);
                        if (range) changeExercise(open, editing, { range: [...range] });
                      }}
                      columns={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <p id="split-rir" className="units-row-label">
                      Reps in reserve
                    </p>
                    <SegmentedControl
                      name="split-rir"
                      aria-labelledby="split-rir"
                      options={RIR_RANGES.map((range) => ({
                        value: label(range),
                        label: label(range),
                      }))}
                      value={exercise.rir ? label(exercise.rir) : ""}
                      onChange={(value) => {
                        const range = RIR_RANGES.find((option) => label(option) === value);
                        if (range) changeExercise(open, editing, { rir: [...range] });
                      }}
                      columns={4}
                    />
                  </div>
                </>
              ) : (
                <p className="type-meta text-ink-2">{splitPrescription(exercise)} a set.</p>
              )}
              <button
                type="button"
                onClick={() => {
                  changeDay(open, {
                    exercises: day.exercises.filter((_, at) => at !== editing),
                  });
                  setEditing(null);
                }}
                className="split-remove"
              >
                <Glyph name="trash" className="glyph-18" />
                Take it off this day
              </button>
            </div>
          )}
        </Sheet>
      </div>
    );
  }

  return (
    <OnboardingFrame steps={steps} current="start" back="/welcome/programme" title="Your split">
      <ul aria-label="Days" className="mt-4.5 border-t border-hair">
        {days.map((day, i) => {
          const name = day.name.trim() || (day.exercises.length > 0 ? `Day ${i + 1}` : "Rest");
          return (
            <li key={i} className="border-b border-hair">
              <button type="button" onClick={() => go(`?day=${i + 1}`)} className="split-day">
                <span className="split-day-number">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="split-row-name">{name}</span>
                  {/* A day named Rest with nothing on it says so once. */}
                  {!(day.exercises.length === 0 && /^rest$/i.test(name)) && (
                    <span className="split-row-sub">{dayLine(day)}</span>
                  )}
                </span>
                <Glyph name="chevronRight" className="glyph-18 shrink-0 text-ink-2" />
              </button>
            </li>
          );
        })}
        {days.length < 14 && (
          <li className="border-b border-hair">
            <button
              type="button"
              onClick={() => {
                const next = days.length + 1;
                setDays((current) => [...current, { name: `Day ${next}`, exercises: [] }]);
                go(`?day=${next}`);
              }}
              className="split-add-day"
            >
              <Glyph name="plus" className="glyph-22 shrink-0" />
              Add a day
            </button>
          </li>
        )}
      </ul>
      <div className="date-row ready-start">
        <label htmlFor="split-start" className="min-w-0 flex-1 font-semibold text-ink-2">
          Repeats every {days.length === 1 ? "day" : `${days.length} days`}, from
        </label>
        <span aria-hidden className="date-row-value">
          {startDate === today ? "Today" : formatIsoWeekdayDay(startDate)}
          <Glyph name="chevronDown" className="glyph-16" />
        </span>
        <input
          id="split-start"
          type="date"
          value={startDate}
          min={today}
          onChange={(event) => setStartDate(event.target.value || today)}
          onClick={(event) => {
            try {
              event.currentTarget.showPicker?.();
            } catch {
              /* Already open, or not allowed here: the field still takes typing. */
            }
          }}
          className="select-row-native"
        />
      </div>

      <PinnedActions stack>
        <FormError message={error ?? undefined} />
        <Button size="lg" className="w-full" disabled={busy} aria-busy={busy} onClick={start}>
          {busy ? "Starting…" : "Start this split"}
        </Button>
      </PinnedActions>
    </OnboardingFrame>
  );
}
