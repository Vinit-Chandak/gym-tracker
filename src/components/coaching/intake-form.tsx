"use client";
import { coachingAction } from "./client-action";

import { Check, Paperclip } from "@/components/ui/icons";
import { useEffect, useRef, useState } from "react";
import { useRouter, unstable_rethrow } from "next/navigation";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { SpeechTextarea } from "@/components/ui/dictation";
import { Field, Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { TRAINING_GOALS } from "@/domain/types";
import { TRAINING_GOAL_LABELS, WEEKDAY_NAMES, WEEKDAY_SHORT } from "@/lib/labels";
import {
  fromKilograms,
  heightUnitFor,
  toCentimetres,
  toFeetAndInches,
  toKilograms,
} from "@/lib/units";
import { cn } from "@/lib/utils";
import {
  coachIntakeSchema,
  validateIntake,
  MAX_COACH_FILE_BYTES,
  MAX_REQUEST_FILES,
  type CoachIntake,
} from "@/domain/coaching-workflow";
import {
  createCoachProgramAction,
  removeCoachAttachmentAction,
  saveCoachIntakeAction,
} from "@/server/actions/coaching-workflow";

type Report = { id: string; name: string; mimeType: string; sizeBytes: number };

/** What a file is, when the browser declines to say. Ordered; the first match wins. */
const TYPE_BY_SUFFIX: readonly (readonly [RegExp, string])[] = [
  [/\.md$/i, "text/markdown"],
  [/\.csv$/i, "text/csv"],
  [/\.txt$/i, "text/plain"],
];
type Change = (patch: Partial<CoachIntake>) => void;

/** The detailed route, in the order the questions build on each other. */
const STEPS = ["You", "Your week", "Your training", "Starting point", "Review"] as const;
const REVIEW = STEPS.length - 1;
const GOAL_LABELS = TRAINING_GOALS.map((goal) => TRAINING_GOAL_LABELS[goal]);

/**
 * The saved answers, with anything still blank taken from the profile.
 *
 * The account already knows the body a programme is for, and the questions here say so:
 * "read back from the profile, so nobody is asked twice". A draft intake used to cancel that
 * outright — the moment one existed, the profile was never consulted again, and somebody who
 * had filled in Profile → Edit profile met three empty boxes. Only blanks are filled, so an
 * answer given here, including one deliberately different from the profile, always wins.
 */
function withProfileDetails(saved: CoachIntake | null, profile?: CoachIntake): CoachIntake {
  const answers = saved ?? coachIntakeSchema.parse({});
  if (!profile) return answers;
  return {
    ...answers,
    goal: answers.goal || profile.goal,
    ageYears: answers.ageYears ?? profile.ageYears,
    weightKg: answers.weightKg ?? profile.weightKg,
    heightCm: answers.heightCm ?? profile.heightCm,
    trainingLocation: answers.trainingLocation ?? profile.trainingLocation,
  };
}

export function CoachIntakeForm({
  initial,
  prefill,
  reports,
  library,
  base,
  configured,
  initialStep = 0,
  preferredUnit = "kg",
}: {
  initial: { id: string; revision: number; answers: CoachIntake; needsSave?: boolean } | null;
  prefill?: CoachIntake;
  reports: Report[];
  library: { slug: string; name: string }[];
  base: "/welcome/programme" | "/profile/programme";
  configured: boolean;
  initialStep?: number;
  preferredUnit?: "kg" | "lb";
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<CoachIntake>(() =>
    withProfileDetails(initial?.answers ?? null, prefill),
  );
  const current = useRef(answers),
    // Anything the profile has just filled in is unsaved, whatever the draft's own state was.
    saved = useRef(
      initial && !initial.needsSave && JSON.stringify(initial.answers) === JSON.stringify(answers)
        ? JSON.stringify(answers)
        : "",
    ),
    revision = useRef(initial?.revision ?? null),
    intakeId = useRef(initial?.id ?? null);
  const saving = useRef<Promise<void> | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveState, setSaveState] = useState("");
  const [step, setStep] = useState(initialStep),
    [files, setFiles] = useState(reports),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const [requestKey] = useState(() => crypto.randomUUID());
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function flush() {
    if (timer.current) clearTimeout(timer.current);
    if (saving.current) await saving.current;
    if (saved.current === JSON.stringify(current.current)) return;
    const work = (async () => {
      setSaveState("Saving…");
      while (saved.current !== JSON.stringify(current.current)) {
        const snapshot = current.current,
          serialized = JSON.stringify(snapshot);
        const result = await coachingAction(() =>
          saveCoachIntakeAction(snapshot, revision.current),
        );
        if (!result.ok) {
          setSaveState("Not saved — retry before leaving.");
          throw new Error(result.error);
        }
        revision.current = result.value.revision;
        intakeId.current = result.value.id;
        saved.current = serialized;
      }
      setSaveState("Saved");
    })();
    saving.current = work;
    try {
      await work;
    } finally {
      if (saving.current === work) saving.current = null;
    }
  }
  function change(patch: Partial<CoachIntake>) {
    const next = { ...current.current, ...patch };
    current.current = next;
    setAnswers(next);
    setError(null);
    setSaveState("Saving…");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flush().catch((e) => {
        unstable_rethrow(e);
        setError(e.message);
      });
    }, 700);
  }
  async function move(next: number) {
    setBusy(true);
    setError(null);
    try {
      await flush();
      setStep(next);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      unstable_rethrow(e);
      setError(e instanceof Error ? e.message : "Could not save your answers.");
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    setBusy(true);
    setError(null);
    try {
      validateIntake(current.current);
      await flush();
      const savedIntakeId = intakeId.current;
      if (!savedIntakeId) throw new Error("Save your answers first.");
      const result = await coachingAction(() =>
        createCoachProgramAction(savedIntakeId, requestKey),
      );
      if (!result.ok) throw new Error(result.error);
      router.push(`${base}/jobs/${result.value.jobId}` as Route);
    } catch (e) {
      unstable_rethrow(e);
      setError(
        e && typeof e === "object" && "issues" in e
          ? (e.issues as { message: string }[]).map((i) => i.message).join(" ")
          : e instanceof Error
            ? e.message
            : "Could not request a programme.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function exit() {
    setBusy(true);
    try {
      await flush();
      router.push(base);
    } catch (e) {
      unstable_rethrow(e);
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  async function upload(selected: FileList | null) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      if (selected.length + current.current.attachmentIds.length > MAX_REQUEST_FILES)
        throw new Error("Attach up to five files to this request.");
      for (const file of Array.from(selected)) {
        if (file.size > MAX_COACH_FILE_BYTES) throw new Error(`${file.name} is larger than 5 MB.`);
        // A browser that names no type for an export still gets the right one from its suffix,
        // which is the usual case for the .csv a tracking app hands over.
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
        change({ attachmentIds: [...current.current.attachmentIds, result.file.id] });
      }
      await flush();
    } catch (e) {
      unstable_rethrow(e);
      setError(e instanceof Error ? e.message : "The upload failed.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(file: Report) {
    setBusy(true);
    setError(null);
    try {
      await flush();
      const result = await coachingAction(() => removeCoachAttachmentAction(file.id));
      if (!result.ok) throw new Error(result.error);
      setFiles((previous) => previous.filter((f) => f.id !== file.id));
      change({ attachmentIds: current.current.attachmentIds.filter((id) => id !== file.id) });
      await flush();
    } catch (e) {
      unstable_rethrow(e);
      setError(e instanceof Error ? e.message : "Could not remove this file.");
    } finally {
      setBusy(false);
    }
  }

  // Nothing is asked before the route is chosen: the two ask for different things.
  if (answers.track === null)
    return (
      <TrackChooser
        busy={busy}
        onChoose={(track) => {
          setStep(0);
          change({ track });
        }}
      />
    );

  const failure = error && (
    <p role="alert" className="text-sm text-danger">
      {error}
    </p>
  );
  const shared = { answers, change, unit: preferredUnit };

  if (answers.track === "guided")
    return (
      <div className="space-y-5">
        <Header title="About you" status={saveState} busy={busy} onExit={exit} />
        <GuidedStep {...shared} />
        {failure}
        <Actions
          busy={busy}
          disabled={!configured}
          next="Create my programme"
          onNext={create}
          onBack={() => change({ track: null })}
        />
        {!configured && <NotConfigured />}
      </div>
    );

  return (
    <div className="space-y-5">
      <Header title={STEPS[step] ?? "Review"} status={saveState} busy={busy} onExit={exit} />
      <StepProgress step={step} busy={busy} onStep={move} />
      {step === 0 && <YouStep {...shared} />}
      {step === 1 && <WeekStep {...shared} />}
      {step === 2 && <TrainingStep {...shared} library={library} />}
      {step === 3 && (
        <StartingPointStep
          {...shared}
          files={files}
          busy={busy}
          onUpload={upload}
          onRemove={remove}
        />
      )}
      {step === REVIEW && <ReviewStep answers={answers} library={library} files={files} />}
      {failure}
      <Actions
        busy={busy}
        disabled={step === REVIEW && !configured}
        onBack={step > 0 ? () => move(step - 1) : () => change({ track: null })}
        next={step === REVIEW ? "Create my programme" : "Continue"}
        onNext={step === REVIEW ? create : () => move(step + 1)}
      />
      {step === REVIEW && !configured && <NotConfigured />}
    </div>
  );
}

/* ------------------------------------------------------------------ chrome */

/** The step's name, what saving is doing, and the way out — one row, one line each. */
function Header({
  title,
  status,
  busy,
  onExit,
}: {
  title: string;
  status: string;
  busy: boolean;
  onExit: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-xl font-medium [overflow-wrap:anywhere]">{title}</h2>
        <p role="status" aria-live="polite" className="min-h-4 text-xs text-ink-subtle">
          {status}
        </p>
      </div>
      <Button size="sm" variant="ghost" disabled={busy} onClick={onExit} className="shrink-0">
        Save and exit
      </Button>
    </div>
  );
}

/**
 * Where you are in the detailed route: one bar per step, the passed ones filled, each
 * tappable. Five named buttons wrapping over two rows was the old version of this, and it
 * read as a row of tabs rather than as progress through one form.
 */
function StepProgress({
  step,
  busy,
  onStep,
}: {
  step: number;
  busy: boolean;
  onStep: (step: number) => void;
}) {
  return (
    <nav aria-label="Programme steps" className="space-y-1.5">
      <div className="flex gap-1.5">
        {STEPS.map((name, i) => (
          <button
            key={name}
            type="button"
            disabled={busy}
            aria-current={step === i ? "step" : undefined}
            aria-label={`Step ${i + 1} of ${STEPS.length}: ${name}`}
            onClick={() => onStep(i)}
            className="min-w-0 flex-1 py-2"
          >
            <span
              className={cn(
                "block h-1 rounded-full transition-colors duration-[var(--ov-duration-feedback)]",
                i <= step ? "bg-accent" : "bg-surface-raised",
              )}
            />
          </button>
        ))}
      </div>
      <p className="text-xs text-ink-subtle tabular-nums">
        Step {step + 1} of {STEPS.length}
      </p>
    </nav>
  );
}

/** Back and Continue, kept on screen while a long step is scrolled. */
function Actions({
  busy,
  disabled,
  next,
  onNext,
  onBack,
}: {
  busy: boolean;
  disabled?: boolean;
  next: string;
  onNext: () => void;
  onBack?: () => void;
}) {
  return (
    <div className="sticky-actions flex items-center gap-3">
      {onBack && (
        <Button variant="secondary" disabled={busy} onClick={onBack} className="shrink-0">
          Back
        </Button>
      )}
      <Button size="lg" disabled={busy || disabled} onClick={onNext} className="min-w-0 flex-1">
        {busy ? "Saving…" : next}
      </Button>
    </div>
  );
}

function NotConfigured() {
  return (
    <p className="text-sm text-ink-muted">
      Programme generation is not available yet. Your answers and files are saved.
    </p>
  );
}

/* ------------------------------------------------------------------ chooser */

/**
 * The first question, and the only one everybody answers the same way: how much you want to
 * be asked. Somebody who has never trained cannot describe a split, and somebody who has
 * should not be made to answer a beginner's questionnaire to get one.
 */
function TrackChooser({
  busy,
  onChoose,
}: {
  busy: boolean;
  onChoose: (track: "guided" | "detailed") => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-medium">Which sounds like you?</h2>
      {(
        [
          {
            track: "guided",
            title: "I'm new to this",
            points: [
              "A few short questions, on one screen",
              "Say the rest in your own words, typed or spoken",
              "The coach picks your split, exercises and starting loads",
            ],
            action: "Start here",
            variant: "primary",
          },
          {
            track: "detailed",
            title: "I already train",
            points: [
              "Your days, session length and running",
              "Injuries, preferences and exercises to leave out",
              "Attach a plan or a report for the coach to work from",
            ],
            action: "Set it up in detail",
            variant: "secondary",
          },
        ] as const
      ).map((option) => (
        <Card key={option.track}>
          <h3 className="text-lg font-medium">{option.title}</h3>
          <ul className="space-y-1.5 text-sm text-ink-muted">
            {option.points.map((point) => (
              <li key={point} className="flex gap-2">
                <Check className="mt-0.5 shrink-0 text-accent" aria-hidden />
                <span className="min-w-0">{point}</span>
              </li>
            ))}
          </ul>
          <Button
            size="lg"
            variant={option.variant}
            disabled={busy}
            className="w-full"
            onClick={() => onChoose(option.track)}
          >
            {option.action}
          </Button>
        </Card>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- fields */

/** Seven chips instead of seven checkboxes: one row, one tap, and the week readable at once. */
function DayPicker({
  legend,
  selected,
  onChange,
}: {
  legend: string;
  selected: number[];
  onChange: (days: number[]) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-medium text-ink-muted">{legend}</legend>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_SHORT.slice(1).map((short, i) => {
          const day = i + 1;
          const on = selected.includes(day);
          return (
            <button
              key={short}
              type="button"
              aria-pressed={on}
              aria-label={WEEKDAY_NAMES[day]}
              onClick={() =>
                onChange(
                  on ? selected.filter((d) => d !== day) : [...selected, day].sort((a, b) => a - b),
                )
              }
              className={cn(
                "flex min-h-12 min-w-0 items-center justify-center rounded-control border text-sm font-medium transition-colors duration-[var(--ov-duration-feedback)]",
                on
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line-strong bg-surface text-ink-muted",
              )}
            >
              {short.slice(0, 1)}
              <span className="sr-only">{WEEKDAY_NAMES[day]}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Gym or home. Which gym, and what is in it, is the app's problem rather than a question. */
function LocationChoice({ answers, change }: { answers: CoachIntake; change: Change }) {
  return (
    <Field
      group
      label="Where you train"
      info="Home means bodyweight and whatever you own. You can register machines later under Gyms and machines, and the coach will use them."
    >
      <SegmentedControl
        name="trainingLocation"
        aria-label="Where you train"
        options={[
          { value: "gym", label: "Gym" },
          { value: "home", label: "Home" },
        ]}
        value={answers.trainingLocation ?? ""}
        onChange={(value) =>
          change({ trainingLocation: value as NonNullable<CoachIntake["trainingLocation"]> })
        }
        columns={2}
      />
    </Field>
  );
}

/** A goal from the list, or one of your own. Both end up as the same sentence for the coach. */
function GoalChoice({ answers, change }: { answers: CoachIntake; change: Change }) {
  const listed = GOAL_LABELS.includes(answers.goal);
  const [own, setOwn] = useState(answers.goal !== "" && !listed);
  return (
    <>
      <Field label="What are you training for?">
        <Select
          value={own ? "other" : listed ? answers.goal : ""}
          onChange={(event) => {
            if (event.target.value === "other") {
              setOwn(true);
              change({ goal: "" });
            } else {
              setOwn(false);
              change({ goal: event.target.value });
            }
          }}
        >
          <option value="" disabled>
            Choose a goal
          </option>
          {GOAL_LABELS.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
          <option value="other">Something else</option>
        </Select>
      </Field>
      {own && (
        <Field label="Your goal">
          <Input
            maxLength={1500}
            placeholder="Run a half marathon in under two hours"
            value={answers.goal}
            onChange={(event) => change({ goal: event.target.value })}
          />
        </Field>
      )}
    </>
  );
}

/**
 * Height, weight and age, filled in from the profile and shown rather than hidden.
 *
 * These were a collapsed "optional body measurements" section, which is how a programme gets
 * written for a body nobody described. They are answers already given at sign-up, so for
 * almost everybody this is three filled boxes to glance at and move past.
 *
 * The boxes hold what was typed, not what was stored. Kilograms are the stored unit, and
 * echoing a converted value straight back would rewrite "164.25" to "164.2" under the
 * cursor; the conversion runs one way, into the answers, on every keystroke.
 */
function BodyFields({
  answers,
  change,
  unit,
}: {
  answers: CoachIntake;
  change: Change;
  unit: "kg" | "lb";
}) {
  const imperial = heightUnitFor(unit) === "ftin";
  const height = answers.heightCm === null ? null : toFeetAndInches(answers.heightCm);
  const [weight, setWeight] = useState(() =>
    answers.weightKg === null ? "" : String(fromKilograms(answers.weightKg, unit)),
  );
  const [centimetres, setCentimetres] = useState(() => String(answers.heightCm ?? ""));
  const [feet, setFeet] = useState(() => String(height?.feet ?? ""));
  const [inches, setInches] = useState(() => String(height?.inches ?? ""));
  const typed = (value: string): number | null => {
    const parsed = Number(value.trim().replace(",", "."));
    return value.trim() === "" || !Number.isFinite(parsed) ? null : parsed;
  };

  const weightAndAge = (
    <>
      <Field label={`Weight (${unit})`}>
        <Input
          inputMode="decimal"
          value={weight}
          onChange={(event) => {
            setWeight(event.target.value);
            const value = typed(event.target.value);
            change({ weightKg: value === null ? null : toKilograms(value, unit) });
          }}
        />
      </Field>
      <Field label="Age">
        <Input
          type="number"
          inputMode="numeric"
          min={10}
          max={100}
          value={answers.ageYears ?? ""}
          onChange={(event) =>
            change({
              ageYears: event.target.value === "" ? null : Number(event.target.value),
            })
          }
        />
      </Field>
    </>
  );

  return (
    <div className="space-y-3">
      {imperial ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Height (feet)">
            <Input
              inputMode="numeric"
              value={feet}
              onChange={(event) => {
                setFeet(event.target.value);
                const whole = typed(event.target.value);
                change({
                  heightCm: whole === null ? null : toCentimetres(whole, typed(inches) ?? 0),
                });
              }}
            />
          </Field>
          <Field label="Inches">
            <Input
              inputMode="numeric"
              value={inches}
              onChange={(event) => {
                setInches(event.target.value);
                const whole = typed(feet);
                change({
                  heightCm:
                    whole === null ? null : toCentimetres(whole, typed(event.target.value) ?? 0),
                });
              }}
            />
          </Field>
        </div>
      ) : null}
      <div className={imperial ? "grid grid-cols-2 gap-3" : "grid grid-cols-3 gap-2"}>
        {!imperial && (
          <Field label="Height (cm)">
            <Input
              inputMode="decimal"
              value={centimetres}
              onChange={(event) => {
                setCentimetres(event.target.value);
                change({ heightCm: typed(event.target.value) });
              }}
            />
          </Field>
        )}
        {weightAndAge}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- steps */

/** The whole guided route: four answers and a box, on one screen. */
function GuidedStep({
  answers,
  change,
  unit,
}: {
  answers: CoachIntake;
  change: Change;
  unit: "kg" | "lb";
}) {
  return (
    <>
      <Card>
        <GoalChoice answers={answers} change={change} />
        <BodyFields answers={answers} change={change} unit={unit} />
      </Card>
      <Card>
        <Field label="Anything that hurts?">
          <SpeechTextarea
            label="injuries"
            rows={3}
            maxLength={3000}
            placeholder="Left knee aches on deep squats. Nothing else."
            value={answers.restrictions}
            onChange={(value) => change({ restrictions: value })}
          />
        </Field>
        <DayPicker
          legend="Days you can train"
          selected={answers.preferredDays}
          onChange={(days) => change({ preferredDays: days, sessionsPerWeek: days.length || null })}
        />
        <LocationChoice answers={answers} change={change} />
      </Card>
      <Card>
        <Field
          label="Anything else the coach should know"
          info="Whatever you would tell a trainer on day one: how active you are, what you have tried, what you want to look and feel like, what you cannot stand doing."
        >
          <SpeechTextarea
            label="anything else"
            rows={8}
            maxLength={16000}
            placeholder="I have never lifted before. I sit all day and want to feel stronger and less stiff. I can get to the gym before work."
            value={answers.prompt}
            onChange={(value) => change({ prompt: value })}
          />
        </Field>
      </Card>
    </>
  );
}

function YouStep({
  answers,
  change,
  unit,
}: {
  answers: CoachIntake;
  change: Change;
  unit: "kg" | "lb";
}) {
  return (
    <>
      <Card>
        <GoalChoice answers={answers} change={change} />
        <BodyFields answers={answers} change={change} unit={unit} />
      </Card>
      <Card>
        <Field
          label="Your brief"
          info="Paste an existing routine, a detailed prompt, or anything you want the coach to work from. Up to 16,000 characters."
        >
          <SpeechTextarea
            label="your brief"
            rows={10}
            maxLength={16000}
            placeholder="Upper/lower four days. Bench matters most. Keep squats under 6 reps; my lower back does not like high-rep squatting."
            value={answers.prompt}
            onChange={(value) => change({ prompt: value })}
          />
        </Field>
      </Card>
    </>
  );
}

function WeekStep({ answers, change }: { answers: CoachIntake; change: Change }) {
  const runs = answers.runsPerWeek ?? 0;
  return (
    <>
      <Card>
        <DayPicker
          legend="Training days"
          selected={answers.preferredDays}
          onChange={(days) =>
            change({
              preferredDays: days,
              sessionsPerWeek: days.length || answers.sessionsPerWeek,
            })
          }
        />
        {answers.preferredDays.length === 0 && (
          <Field
            label="Sessions a week"
            hint="Pick the days above instead if you train on set days."
          >
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={7}
              value={answers.sessionsPerWeek ?? ""}
              onChange={(event) =>
                change({
                  sessionsPerWeek: event.target.value === "" ? null : Number(event.target.value),
                })
              }
            />
          </Field>
        )}
        <Field label="Usual session length (minutes)">
          <Input
            type="number"
            inputMode="numeric"
            min={10}
            max={240}
            value={answers.minutesPerSession ?? ""}
            onChange={(event) =>
              change({
                minutesPerSession: event.target.value === "" ? null : Number(event.target.value),
              })
            }
          />
        </Field>
        {answers.preferredDays.length > 0 && (
          <Disclosure summary="Different time on some days" variant="footer">
            <div className="space-y-3">
              {answers.preferredDays.map((day) => (
                <Field key={day} label={`${WEEKDAY_NAMES[day]} (minutes)`}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={10}
                    max={240}
                    value={answers.dayMinutes.find((d) => d.day === day)?.minutes ?? ""}
                    onChange={(event) =>
                      change({
                        dayMinutes: [
                          ...answers.dayMinutes.filter((d) => d.day !== day),
                          ...(event.target.value
                            ? [{ day, minutes: Number(event.target.value) }]
                            : []),
                        ],
                      })
                    }
                  />
                </Field>
              ))}
            </div>
          </Disclosure>
        )}
      </Card>
      <Card>
        <Field label="Runs a week" hint="Leave at zero if you do not run.">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={7}
            value={answers.runsPerWeek ?? ""}
            onChange={(event) =>
              change({
                runsPerWeek: event.target.value === "" ? null : Number(event.target.value),
                ...(Number(event.target.value) ? {} : { preferredRunDays: [] }),
              })
            }
          />
        </Field>
        {runs > 0 && (
          <DayPicker
            legend="Run days"
            selected={answers.preferredRunDays}
            onChange={(days) =>
              change({
                preferredRunDays: days,
                runsPerWeek: days.length || answers.runsPerWeek,
              })
            }
          />
        )}
      </Card>
      <Card>
        <LocationChoice answers={answers} change={change} />
      </Card>
    </>
  );
}

function TrainingStep({
  answers,
  change,
  library,
}: {
  answers: CoachIntake;
  change: Change;
  library: { slug: string; name: string }[];
}) {
  return (
    <>
      <Card>
        <Field label="How long have you been training?">
          <Select
            value={answers.experience}
            onChange={(event) =>
              change({ experience: event.target.value as CoachIntake["experience"] })
            }
          >
            {(
              [
                ["unknown", "Not sure"],
                ["beginner", "New to training"],
                ["intermediate", "Some consistent experience"],
                ["experienced", "Experienced"],
                ["returning", "Returning after a break"],
              ] as const
            ).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Injuries or movements to avoid">
          <SpeechTextarea
            label="injuries"
            rows={4}
            maxLength={3000}
            placeholder="Left knee aches on deep squats. A physio told me to keep the range above parallel."
            value={answers.restrictions}
            onChange={(value) => change({ restrictions: value })}
          />
        </Field>
        <Field label="Exercises you enjoy or dislike">
          <SpeechTextarea
            label="preferences"
            rows={3}
            maxLength={2000}
            placeholder="Love rows and pull-ups. I would rather not do burpees."
            value={answers.preferences}
            onChange={(value) => change({ preferences: value })}
          />
        </Field>
      </Card>
      <Card>
        <Field
          label="Leave these out entirely"
          info="Chosen movements are excluded from every session the coach writes."
        >
          <Select
            value=""
            onChange={(event) => {
              if (event.target.value)
                change({
                  avoidExerciseSlugs: [...answers.avoidExerciseSlugs, event.target.value],
                });
            }}
          >
            <option value="">Choose an exercise</option>
            {library
              .filter((exercise) => !answers.avoidExerciseSlugs.includes(exercise.slug))
              .map((exercise) => (
                <option key={exercise.slug} value={exercise.slug}>
                  {exercise.name}
                </option>
              ))}
          </Select>
        </Field>
        {answers.avoidExerciseSlugs.length > 0 && (
          <ul className="ruled-list">
            {answers.avoidExerciseSlugs.map((slug) => (
              <li key={slug} className="flex items-center justify-between gap-2 py-1 text-sm">
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {library.find((exercise) => exercise.slug === slug)?.name ?? slug}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    change({
                      avoidExerciseSlugs: answers.avoidExerciseSlugs.filter(
                        (value) => value !== slug,
                      ),
                    })
                  }
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

/**
 * What you are lifting now, in one box.
 *
 * This was a form per exercise — load, unit, reps, reps in reserve, what the load meant,
 * which gym, which machine, the date and a note — repeated for as many lifts as you cared
 * to add. It asked for more precision than a self-report can carry, and the coach
 * recalibrates from real logged sets within a session or two regardless.
 */
function StartingPointStep({
  answers,
  change,
  files,
  busy,
  onUpload,
  onRemove,
}: {
  answers: CoachIntake;
  change: Change;
  files: Report[];
  busy: boolean;
  onUpload: (files: FileList | null) => void;
  onRemove: (file: Report) => void;
}) {
  return (
    <>
      <Card>
        <Field
          label="If you already lift, what are you lifting?"
          info="Rough numbers are enough. The coach treats them as a starting point and corrects them from your logged sets."
        >
          <SpeechTextarea
            label="your current lifts"
            rows={8}
            maxLength={3000}
            placeholder="Incline bench 60 kg for 8. Dumbbell bench 25s for 12. Squat 80 kg for 5, leaving a couple in the tank."
            value={answers.recentTraining}
            onChange={(value) => change({ recentTraining: value })}
          />
        </Field>
      </Card>
      <Card>
        <Field
          label="Reports and plans"
          info="PDF, JPG, PNG, CSV or text. Up to 5 MB each, five files. Files stay available for later coaching reviews until you remove them."
        >
          <FilePicker busy={busy} onUpload={onUpload} />
        </Field>
        {files.length > 0 && (
          <ul className="ruled-list">
            {files.map((file) => (
              <li key={file.id} className="flex items-center gap-2 py-2">
                <input
                  type="checkbox"
                  id={`report-${file.id}`}
                  checked={answers.attachmentIds.includes(file.id)}
                  className="size-5 shrink-0 accent-[var(--ov-accent)]"
                  disabled={
                    busy ||
                    (!answers.attachmentIds.includes(file.id) &&
                      answers.attachmentIds.length >= MAX_REQUEST_FILES)
                  }
                  onChange={(event) =>
                    change({
                      attachmentIds: event.target.checked
                        ? [...answers.attachmentIds, file.id]
                        : answers.attachmentIds.filter((id) => id !== file.id),
                    })
                  }
                />
                <label
                  htmlFor={`report-${file.id}`}
                  className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]"
                >
                  {file.name}
                </label>
                <a
                  className="shrink-0 text-sm text-accent underline"
                  href={`/api/coaching/attachments/${file.id}`}
                  download
                >
                  Download
                </a>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRemove(file)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

/**
 * A tap target rather than a native file button. The browser's own control renders as
 * "Choose Files / no files selected" pinned to the left of its box, which says nothing
 * about what may be attached and looks like nothing else on the screen.
 */
function FilePicker({
  busy,
  onUpload,
}: {
  busy: boolean;
  onUpload: (files: FileList | null) => void;
}) {
  return (
    <label
      className={cn(
        "flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-control border border-dashed border-line-strong px-4 py-5 text-center transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised",
        busy && "pointer-events-none opacity-50",
      )}
    >
      <Paperclip className="text-ink-subtle" aria-hidden />
      <span className="text-sm font-medium">Add files</span>
      <span className="text-xs text-ink-subtle">PDF, image, CSV or text</span>
      <input
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.txt,.md,.csv"
        multiple
        disabled={busy}
        className="sr-only"
        onChange={(event) => {
          onUpload(event.target.files);
          event.target.value = "";
        }}
      />
    </label>
  );
}

function ReviewStep({
  answers,
  library,
  files,
}: {
  answers: CoachIntake;
  library: { slug: string; name: string }[];
  files: Report[];
}) {
  const days = answers.preferredDays.map((d) => WEEKDAY_NAMES[d]).join(", ");
  return (
    <Card>
      <dl className="text-sm ruled-list">
        {(
          [
            ["Goal", answers.goal || "Not answered"],
            [
              "Your week",
              `${answers.sessionsPerWeek ?? "?"} sessions · ${
                answers.minutesPerSession ?? "?"
              } minutes · ${days || "flexible days"}`,
            ],
            [
              "Running",
              answers.runsPerWeek
                ? `${answers.runsPerWeek} a week · ${
                    answers.preferredRunDays.map((d) => WEEKDAY_NAMES[d]).join(", ") ||
                    "flexible days"
                  }`
                : "None",
            ],
            [
              "Where",
              answers.trainingLocation === "home"
                ? "Home"
                : answers.trainingLocation === "gym"
                  ? "Gym"
                  : "Not answered",
            ],
            [
              "You",
              [
                answers.heightCm ? `${answers.heightCm} cm` : null,
                answers.weightKg ? `${answers.weightKg} kg` : null,
                answers.ageYears ? `${answers.ageYears} years` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Not answered",
            ],
            ["Injuries", answers.restrictions || "None reported"],
            ["Preferences", answers.preferences || "None reported"],
            [
              "Left out",
              answers.avoidExerciseSlugs
                .map((slug) => library.find((e) => e.slug === slug)?.name ?? slug)
                .join(", ") || "Nothing",
            ],
            ["Lifting now", answers.recentTraining || "Not reported"],
            [
              "Files",
              files
                .filter((f) => answers.attachmentIds.includes(f.id))
                .map((f) => f.name)
                .join(", ") || "None",
            ],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex flex-wrap gap-x-4 gap-y-0.5 py-2">
            <dt className="w-24 shrink-0 text-ink-muted">{label}</dt>
            <dd className="min-w-0 flex-1 break-words whitespace-pre-wrap">{value}</dd>
          </div>
        ))}
      </dl>
      {/* A question is as long as a sentence, so it gets a line of its own rather than a
          six-character label column. */}
      {answers.clarifications.length > 0 && (
        <Disclosure
          summary="What the coach asked"
          meta={`${answers.clarifications.length} answered`}
          variant="inline"
        >
          <dl className="text-sm ruled-list">
            {answers.clarifications.map((entry) => (
              <div key={entry.question} className="space-y-0.5 py-2">
                <dt className="[overflow-wrap:anywhere] text-ink-muted">{entry.question}</dt>
                <dd className="break-words whitespace-pre-wrap">{entry.answer}</dd>
              </div>
            ))}
          </dl>
        </Disclosure>
      )}
      {answers.prompt && (
        <Disclosure summary="Your brief" variant="footer">
          <p className="text-sm break-words whitespace-pre-wrap">{answers.prompt}</p>
        </Disclosure>
      )}
    </Card>
  );
}
