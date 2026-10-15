"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import type { Route } from "next";
import { useRouter, unstable_rethrow } from "next/navigation";

import { FormError } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Glyph } from "@/components/ui/glyphs";
import { Textarea } from "@/components/ui/input";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  coachIntakeSchema,
  MAX_COACH_FILE_BYTES,
  MAX_REQUEST_FILES,
  type CoachIntake,
} from "@/domain/coaching-workflow";
import { TRAINING_GOAL_LABELS, WEEKDAY_NAMES, WEEKDAY_SHORT } from "@/lib/labels";
import {
  fromKilograms,
  heightUnitFor,
  toCentimetres,
  toFeetAndInches,
  toKilograms,
} from "@/lib/units";
import {
  chooseTrainingModeAction,
  createCoachProgramAction,
  saveCoachIntakeAction,
} from "@/server/actions/coaching-workflow";

import { coachingAction } from "./client-action";

type Report = { id: string; name: string; mimeType: string; sizeBytes: number };
type Key = keyof CoachIntake;

/** The goals in the order the boards show them, as the words the coach reads. */
const GOALS = [
  TRAINING_GOAL_LABELS.get_stronger,
  TRAINING_GOAL_LABELS.build_muscle,
  TRAINING_GOAL_LABELS.lose_fat,
  TRAINING_GOAL_LABELS.endurance,
  TRAINING_GOAL_LABELS.general_fitness,
];
const LENGTHS = [45, 60, 75, 90] as const;

/** What a file is, when the browser declines to say. Ordered; the first match wins. */
const TYPE_BY_SUFFIX: readonly (readonly [RegExp, string])[] = [
  [/\.md$/i, "text/markdown"],
  [/\.csv$/i, "text/csv"],
  [/\.txt$/i, "text/plain"],
];

/** The intake's own rules, field by field, as the sentence each field shows under it. */
function problems(answers: CoachIntake, detailed: boolean): Partial<Record<Key, string>> {
  const found: Partial<Record<Key, string>> = {};
  if (!answers.goal.trim()) found.goal = "Choose a goal.";
  if (answers.preferredDays.length === 0) found.preferredDays = "Choose the days you can train.";
  if (detailed && !answers.minutesPerSession)
    found.minutesPerSession = "Choose how long a session.";
  if (answers.heightCm === null) found.heightCm = "Add your height.";
  else if (answers.heightCm < 50 || answers.heightCm > 260)
    found.heightCm = "Enter a height between 50 and 260 cm.";
  if (answers.weightKg === null) found.weightKg = "Add your weight.";
  else if (answers.weightKg < 20 || answers.weightKg > 500)
    found.weightKg = "Enter a weight between 20 and 500 kg.";
  if (answers.ageYears === null) found.ageYears = "Add your age.";
  else if (answers.ageYears < 10 || answers.ageYears > 100)
    found.ageYears = "Enter an age between 10 and 100.";
  return found;
}

/**
 * One sentence for the row of boxes: everything missing named together ("Add your height, weight
 * and age."), else what is wrong with the first box that is out of range.
 */
function bodyProblem(
  answers: CoachIntake,
  shown: Partial<Record<Key, string>>,
): string | undefined {
  const missing = (
    [
      ["heightCm", "height"],
      ["weightKg", "weight"],
      ["ageYears", "age"],
    ] as const
  )
    .filter(([key]) => shown[key] && answers[key] === null)
    .map(([, word]) => word);
  if (missing.length > 0)
    return `Add your ${
      missing.length === 1
        ? missing[0]
        : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`
    }.`;
  return shown.heightCm ?? shown.weightKg ?? shown.ageYears;
}

/** A typed number, or null when it is blank or not one. */
function typed(value: string): number | null {
  const parsed = Number(value.trim().replace(",", "."));
  return value.trim() === "" || !Number.isFinite(parsed) ? null : parsed;
}

/**
 * The coach's questions inside setup (boards Your first programme, What should the coach plan?):
 * one screen in the setup frame, its answers read back from what setup and the profile already
 * know, and nothing asked that setup asked already (the place, the experience, the running).
 *
 * New to this: the goal, the days, height, weight and age, and anything that hurts. Already
 * trains: the session's length too, and three optional answers folded under their names (what
 * they lift now, anything to avoid, a plan to work from). Each answer the coach needs and was
 * not given is said under its own field when Create is pressed, and the first is brought into
 * view (audit B12). The answers are saved, then the request is made, which opens the screen
 * where the coach writes.
 */
export function SetupCoachForm({
  detailed,
  initial,
  prefill,
  reports,
  preferredUnit,
  configured,
  offerTracking,
}: {
  /** The route of someone who already trains. */
  detailed: boolean;
  initial: { id: string; revision: number; answers: CoachIntake } | null;
  prefill: CoachIntake;
  reports: Report[];
  preferredUnit: "kg" | "lb";
  configured: boolean;
  /** "Just log workouts for now", for a beginner, whose only plan step this is. */
  offerTracking: boolean;
}) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [answers, setAnswers] = useState<CoachIntake>(() => {
    const saved = initial?.answers ?? coachIntakeSchema.parse({});
    return {
      ...saved,
      track: prefill.track,
      goal: saved.goal || prefill.goal,
      ageYears: saved.ageYears ?? prefill.ageYears,
      weightKg: saved.weightKg ?? prefill.weightKg,
      heightCm: saved.heightCm ?? prefill.heightCm,
      trainingLocation: prefill.trainingLocation,
      gymId: prefill.gymId,
      runsPerWeek: saved.runsPerWeek ?? prefill.runsPerWeek,
      attachmentIds: saved.attachmentIds.filter((id) => reports.some((file) => file.id === id)),
    };
  });
  const revision = useRef(initial?.revision ?? null);
  const intakeId = useRef(initial?.id ?? null);
  const [files, setFiles] = useState(reports);
  const [shown, setShown] = useState<Partial<Record<Key, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestKey] = useState(() => crypto.randomUUID());
  const working = busy || navigating;
  const unit = preferredUnit;
  const imperial = heightUnitFor(unit) === "ftin";

  // The boxes hold what was typed; the answers hold kilograms and centimetres.
  const [weight, setWeight] = useState(() =>
    answers.weightKg === null ? "" : String(fromKilograms(answers.weightKg, unit)),
  );
  const height = answers.heightCm === null ? null : toFeetAndInches(answers.heightCm);
  const [centimetres, setCentimetres] = useState(() => String(answers.heightCm ?? ""));
  const [feet, setFeet] = useState(() => String(height?.feet ?? ""));
  const [inches, setInches] = useState(() => String(height?.inches ?? ""));

  function change(patch: Partial<CoachIntake>) {
    setAnswers((current) => ({ ...current, ...patch }));
    setError(null);
    // An answer given clears what was said about it.
    setShown((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch) as Key[]) delete next[key];
      if ("preferredDays" in patch) delete next.sessionsPerWeek;
      return next;
    });
  }

  async function save(): Promise<string> {
    const result = await coachingAction(() => saveCoachIntakeAction(answers, revision.current));
    if (!result.ok) throw new Error(result.error);
    revision.current = result.value.revision;
    intakeId.current = result.value.id;
    return result.value.id;
  }

  async function create() {
    const found = problems(answers, detailed);
    setShown(found);
    if (Object.keys(found).length > 0) {
      // The first field the coach still needs, in view and in hand.
      requestAnimationFrame(() => {
        const first = document.querySelector<HTMLElement>("[data-field-error='true']");
        first?.scrollIntoView({ block: "center" });
        first?.querySelector<HTMLElement>("input, textarea, button")?.focus();
      });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const id = await save();
      const result = await coachingAction(() => createCoachProgramAction(id, requestKey));
      if (!result.ok) throw new Error(result.error);
      startNavigation(() => router.push(`/welcome/programme/jobs/${result.value.jobId}` as Route));
    } catch (e) {
      unstable_rethrow(e);
      setError(e instanceof Error ? e.message : "Could not ask the coach. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function track() {
    setBusy(true);
    setError(null);
    const result = await coachingAction(() => chooseTrainingModeAction("track"));
    if (result.ok) startNavigation(() => router.push("/today"));
    else setError(result.error);
    setBusy(false);
  }

  async function upload(selected: FileList | null) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      if (selected.length + answers.attachmentIds.length > MAX_REQUEST_FILES)
        throw new Error("Attach up to five files.");
      for (const file of Array.from(selected)) {
        if (file.size > MAX_COACH_FILE_BYTES) throw new Error(`${file.name} is larger than 5 MB.`);
        const mime =
          file.type || TYPE_BY_SUFFIX.find(([suffix]) => suffix.test(file.name))?.[1] || "";
        const response = await fetch("/api/coaching/attachments", {
          method: "POST",
          headers: { "Content-Type": mime, "X-File-Name": encodeURIComponent(file.name) },
          body: file,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "The upload failed.");
        setFiles((previous) => [...previous, result.file]);
        setAnswers((current) => ({
          ...current,
          attachmentIds: [...current.attachmentIds, result.file.id],
        }));
      }
    } catch (e) {
      unstable_rethrow(e);
      setError(e instanceof Error ? e.message : "The upload failed.");
    } finally {
      setBusy(false);
    }
  }

  const attached = files.filter((file) => answers.attachmentIds.includes(file.id));

  return (
    <div className="setup-coach">
      <fieldset
        className="setup-coach-group"
        data-field-error={shown.goal ? "true" : undefined}
        aria-describedby={shown.goal ? "coach-goal-error" : undefined}
      >
        <legend className="you-label">Your goal</legend>
        <div className="choice-chips">
          {GOALS.map((goal) => (
            <label key={goal} className="choice-chip">
              <input
                type="radio"
                name="coach-goal"
                value={goal}
                checked={answers.goal === goal}
                onChange={() => change({ goal })}
                className="sr-only"
              />
              {goal}
            </label>
          ))}
        </div>
        <Problem id="coach-goal-error" message={shown.goal} />
      </fieldset>

      <fieldset
        className="setup-coach-group"
        data-field-error={shown.preferredDays ? "true" : undefined}
        aria-describedby={shown.preferredDays ? "coach-days-error" : undefined}
      >
        <legend className="you-label">Days you can train</legend>
        <div className="day-chips-wrap">
          <div className="day-chips">
            {WEEKDAY_SHORT.slice(1).map((short, i) => {
              const day = i + 1;
              const on = answers.preferredDays.includes(day);
              return (
                <label key={short} className="choice-chip day-chip">
                  <input
                    type="checkbox"
                    checked={on}
                    aria-label={WEEKDAY_NAMES[day]}
                    onChange={() => {
                      const days = on
                        ? answers.preferredDays.filter((d) => d !== day)
                        : [...answers.preferredDays, day].sort((a, b) => a - b);
                      change({ preferredDays: days, sessionsPerWeek: days.length || null });
                    }}
                    className="sr-only"
                  />
                  <span aria-hidden>{short}</span>
                </label>
              );
            })}
          </div>
        </div>
        <Problem id="coach-days-error" message={shown.preferredDays} />
      </fieldset>

      {detailed && (
        <div
          className="setup-coach-group"
          data-field-error={shown.minutesPerSession ? "true" : undefined}
        >
          <p id="coach-length" className="you-label">
            How long a session
          </p>
          <div className="mt-2">
            <SegmentedControl
              name="coach-length"
              aria-labelledby="coach-length"
              aria-invalid={shown.minutesPerSession ? true : undefined}
              options={LENGTHS.map((minutes) => ({
                value: String(minutes),
                label: `${minutes} min`,
              }))}
              value={answers.minutesPerSession ? String(answers.minutesPerSession) : ""}
              onChange={(value) => change({ minutesPerSession: Number(value) })}
              columns={4}
            />
          </div>
          <Problem message={shown.minutesPerSession} />
        </div>
      )}

      <div className="setup-coach-body" data-imperial={imperial || undefined}>
        {imperial ? (
          <>
            <FigureField
              id="coach-feet"
              label="Height"
              suffix="ft"
              inputMode="numeric"
              value={feet}
              error={shown.heightCm}
              onChange={(value) => {
                setFeet(value);
                const whole = typed(value);
                change({
                  heightCm: whole === null ? null : toCentimetres(whole, typed(inches) ?? 0),
                });
              }}
            />
            <FigureField
              id="coach-inches"
              label="Height, inches"
              labelHidden
              suffix="in"
              inputMode="numeric"
              value={inches}
              onChange={(value) => {
                setInches(value);
                const whole = typed(feet);
                change({
                  heightCm: whole === null ? null : toCentimetres(whole, typed(value) ?? 0),
                });
              }}
            />
          </>
        ) : (
          <FigureField
            id="coach-height"
            label="Height"
            suffix="cm"
            inputMode="decimal"
            value={centimetres}
            error={shown.heightCm}
            onChange={(value) => {
              setCentimetres(value);
              change({ heightCm: typed(value) });
            }}
          />
        )}
        <FigureField
          id="coach-weight"
          label="Weight"
          suffix={unit}
          inputMode="decimal"
          value={weight}
          error={shown.weightKg}
          onChange={(value) => {
            setWeight(value);
            const kilograms = typed(value);
            change({ weightKg: kilograms === null ? null : toKilograms(kilograms, unit) });
          }}
        />
        <FigureField
          id="coach-age"
          label="Age"
          inputMode="numeric"
          value={answers.ageYears === null ? "" : String(answers.ageYears)}
          error={shown.ageYears}
          onChange={(value) => change({ ageYears: typed(value) })}
        />
      </div>
      <Problem message={bodyProblem(answers, shown)} />
      {!detailed && <p className="setup-caption">The coach sets your first loads from these.</p>}

      {detailed ? (
        <div className="setup-coach-more">
          <Folded title="What you lift now" sub="Optional, in your own words: “bench 100 for 5”">
            <Textarea
              aria-label="What you lift now"
              rows={4}
              maxLength={3000}
              value={answers.recentTraining}
              onChange={(event) => change({ recentTraining: event.target.value })}
            />
          </Folded>
          <Folded title="Anything to avoid?" sub="Optional: injuries, or exercises to leave out">
            <Textarea
              aria-label="Anything to avoid?"
              rows={4}
              maxLength={3000}
              value={answers.restrictions}
              onChange={(event) => change({ restrictions: event.target.value })}
            />
          </Folded>
          <Folded
            title="Attach a plan"
            sub={
              attached.length > 0
                ? attached.map((file) => file.name).join(", ")
                : "Optional: a programme or report to work from"
            }
          >
            <label className="setup-file">
              <Glyph name="link" className="glyph-20 shrink-0" />
              <span className="min-w-0 flex-1">
                Add a file: PDF, image, CSV or text, up to 5 MB
              </span>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.txt,.md,.csv"
                multiple
                disabled={working}
                className="sr-only"
                onChange={(event) => {
                  void upload(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
            {attached.length > 0 && (
              <ul className="mt-1">
                {attached.map((file) => (
                  <li
                    key={file.id}
                    className="flex min-h-11 items-center gap-3 border-b border-hair"
                  >
                    <span className="min-w-0 flex-1 type-meta font-semibold [overflow-wrap:break-word]">
                      {file.name}
                    </span>
                    <button
                      type="button"
                      aria-label={`Leave out ${file.name}`}
                      onClick={() =>
                        change({
                          attachmentIds: answers.attachmentIds.filter((id) => id !== file.id),
                        })
                      }
                      className="review-remove"
                    >
                      <Glyph name="close" className="glyph-20" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Folded>
        </div>
      ) : (
        <div className="setup-coach-more">
          <Folded title="Anything that hurts?" sub="Optional: injuries, or anything else to know">
            <Textarea
              aria-label="Anything that hurts?"
              rows={3}
              maxLength={3000}
              value={answers.restrictions}
              onChange={(event) => change({ restrictions: event.target.value })}
            />
          </Folded>
        </div>
      )}

      <PinnedActions stack>
        <FormError message={error ?? undefined} />
        {!configured && (
          <p className="type-meta-small text-ink-2">
            The coach is not taking new programmes right now. Log your own workouts meanwhile.
          </p>
        )}
        <Button
          size="lg"
          className="w-full"
          disabled={working || !configured}
          aria-busy={working}
          onClick={create}
        >
          {working ? "Asking the coach…" : "Create my programme"}
        </Button>
        {offerTracking && (
          <button type="button" disabled={working} onClick={track} className="text-action w-full">
            Just log workouts for now
          </button>
        )}
      </PinnedActions>
    </div>
  );
}

/**
 * A figure typed in a box (height, weight, age): its name above, the figure in Jost, and its
 * unit inside the box at its end. What is wrong with it is said once under the row of boxes,
 * and the box is marked.
 */
function FigureField({
  id,
  label,
  labelHidden = false,
  suffix,
  inputMode,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  labelHidden?: boolean;
  suffix?: string;
  inputMode: "numeric" | "decimal";
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="figure-field" data-field-error={error ? "true" : undefined}>
      <label htmlFor={id} className="figure-field-label">
        {labelHidden ? <span className="sr-only">{label}</span> : label}
        {labelHidden && <span aria-hidden>&nbsp;</span>}
      </label>
      <span className="figure-field-box">
        <input
          id={id}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          value={value}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
          className="figure-field-input"
          data-suffix={suffix ? "true" : undefined}
        />
        {suffix && (
          <span aria-hidden className="figure-field-suffix">
            {suffix}
          </span>
        )}
      </span>
    </div>
  );
}

/** What is wrong with a group, under it, in ink and led by its glyph. */
function Problem({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="you-error">
      <Glyph name="warn" className="mt-px glyph-18 shrink-0" />
      {message}
    </p>
  );
}

/** An optional answer folded under its name and what it is for; open, its box under them. */
function Folded({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <details className="setup-fold group">
      <summary className="setup-fold-summary">
        <span className="min-w-0 flex-1">
          <span className="setup-fold-title">{title}</span>
          <span className="setup-fold-sub">{sub}</span>
        </span>
        <Glyph
          name="chevronDown"
          className="glyph-18 shrink-0 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="pb-3">{children}</div>
    </details>
  );
}
