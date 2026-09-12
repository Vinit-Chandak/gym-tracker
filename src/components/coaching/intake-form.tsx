"use client";
import { coachingAction } from "./client-action";

import { useEffect, useRef, useState } from "react";
import { useRouter, unstable_rethrow } from "next/navigation";
import type { Route } from "next";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea, INPUT_CLASS } from "@/components/ui/input";
import { coachIntakeSchema, validateIntake, type CoachIntake } from "@/domain/coaching-workflow";
import {
  createCoachProgramAction,
  removeCoachAttachmentAction,
  saveCoachIntakeAction,
} from "@/server/actions/coaching-workflow";

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
type Report = { id: string; name: string; mimeType: string; sizeBytes: number };
type Location = { id: string; name: string };
type Machine = { id: string; gymId: string; name: string };
const STEPS = [
  "Your goal",
  "Your week",
  "Your starting point",
  "Example lifts",
  "Reports",
  "Review",
];

export function CoachIntakeForm({
  initial,
  prefill,
  reports,
  gyms,
  machines,
  library,
  base,
  configured,
  initialStep = 0,
  preferredUnit = "kg",
}: {
  initial: { id: string; revision: number; answers: CoachIntake; needsSave?: boolean } | null;
  prefill?: CoachIntake;
  reports: Report[];
  gyms: Location[];
  machines: Machine[];
  library: { slug: string; name: string }[];
  base: "/welcome/programme" | "/settings/programme";
  configured: boolean;
  initialStep?: number;
  preferredUnit?: "kg" | "lb";
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<CoachIntake>(
    () => initial?.answers ?? prefill ?? coachIntakeSchema.parse({}),
  );
  const current = useRef(answers),
    saved = useRef(initial && !initial.needsSave ? JSON.stringify(answers) : ""),
    revision = useRef(initial?.revision ?? null),
    intakeId = useRef(initial?.id ?? null);
  const saving = useRef<Promise<void> | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveState, setSaveState] = useState("Your answers save as you go.");
  const [step, setStep] = useState(initialStep),
    [files, setFiles] = useState(reports),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [newLift, setNewLift] = useState("");
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
  async function upload(selected: FileList | null) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      if (selected.length + current.current.attachmentIds.length > 5)
        throw new Error("Attach up to five files to this request.");
      for (const file of Array.from(selected)) {
        if (file.size > 3 * 1024 * 1024) throw new Error(`${file.name} is larger than 3 MB.`);
        const mime =
          file.type ||
          (/\.md$/i.test(file.name)
            ? "text/markdown"
            : /\.txt$/i.test(file.name)
              ? "text/plain"
              : "");
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
  const number = (
    key: "sessionsPerWeek" | "minutesPerSession" | "weightKg" | "heightCm",
    label: string,
    min: number,
    max: number,
  ) => (
    <Field label={label}>
      <Input
        type="number"
        min={min}
        max={max}
        value={answers[key] ?? ""}
        onChange={(e) => change({ [key]: e.target.value === "" ? null : Number(e.target.value) })}
      />
    </Field>
  );
  const text = (
    key:
      | "goal"
      | "priorities"
      | "prompt"
      | "recentTraining"
      | "physiqueGoal"
      | "restrictions"
      | "preferences",
    label: string,
    maxLength: number,
    hint?: string,
  ) => (
    <Field label={label} hint={hint}>
      <Textarea
        value={answers[key]}
        maxLength={maxLength}
        rows={key === "prompt" ? 9 : 3}
        onChange={(e) => change({ [key]: e.target.value })}
      />
    </Field>
  );
  const liftChange = (index: number, patch: Partial<CoachIntake["baselines"][number]>) =>
    change({
      baselines: current.current.baselines.map((lift, i) =>
        i === index ? { ...lift, ...patch } : lift,
      ),
    });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-medium">Create your own programme</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Tell the coach what you want. Review and edit its draft before you start training.
        </p>
      </div>
      <nav aria-label="Programme creation steps" className="flex flex-wrap gap-1">
        {STEPS.map((name, i) => (
          <Button
            key={name}
            size="sm"
            variant={step === i ? "primary" : "ghost"}
            aria-current={step === i ? "step" : undefined}
            disabled={busy}
            onClick={() => move(i)}
          >
            {i + 1}. {name}
          </Button>
        ))}
      </nav>
      <p role="status" aria-live="polite" className="text-xs text-ink-muted">
        {saveState}
      </p>
      <Card>
        <h2 className="text-lg font-medium">{STEPS[step]}</h2>
        {step === 0 && (
          <>
            {text(
              "goal",
              "What are you training for?",
              1500,
              "Your main outcome, in your own words.",
            )}
            {text(
              "priorities",
              "What matters most? (optional)",
              1000,
              "For example, strength, muscle, running, consistency or an event.",
            )}
            {text(
              "prompt",
              "Your full brief (optional)",
              16000,
              "Paste a detailed prompt, an existing routine, or instructions you want the coach to consider. Up to 16,000 characters.",
            )}
          </>
        )}
        {step === 1 && (
          <>
            {number("sessionsPerWeek", "Training sessions per week", 1, 7)}
            {number("minutesPerSession", "Usual minutes per session", 10, 240)}
            <fieldset>
              <legend className="mb-2 text-sm text-ink-muted">
                Preferred training days (leave blank for flexible days)
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {WEEKDAYS.map((day, i) => (
                  <label key={day} className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-5 accent-[var(--ov-accent)]"
                      checked={answers.preferredDays.includes(i + 1)}
                      onChange={(e) =>
                        change({
                          preferredDays: e.target.checked
                            ? [...answers.preferredDays, i + 1].sort()
                            : answers.preferredDays.filter((d) => d !== i + 1),
                        })
                      }
                    />
                    {day}
                  </label>
                ))}
              </div>
            </fieldset>
            {answers.preferredDays.map((day) => (
              <Field key={day} label={`${WEEKDAYS[day - 1]} minutes (optional override)`}>
                <Input
                  type="number"
                  min={10}
                  max={240}
                  value={answers.dayMinutes.find((d) => d.day === day)?.minutes ?? ""}
                  onChange={(e) =>
                    change({
                      dayMinutes: [
                        ...answers.dayMinutes.filter((d) => d.day !== day),
                        ...(e.target.value ? [{ day, minutes: Number(e.target.value) }] : []),
                      ],
                    })
                  }
                />
              </Field>
            ))}
            <Field label="Where will you train?">
              <select
                className={INPUT_CLASS}
                value={answers.gymId ?? ""}
                onChange={(e) => change({ gymId: e.target.value || null })}
              >
                <option value="">Choose a location</option>
                {gyms.map((gym) => (
                  <option key={gym.id} value={gym.id}>
                    {gym.name}
                  </option>
                ))}
              </select>
            </Field>
            {gyms.length === 0 && (
              <LinkButton
                href={base === "/welcome/programme" ? "/welcome/gym" : "/gyms/new"}
                variant="secondary"
              >
                Add a training location
              </LinkButton>
            )}
            <Field
              label="Rest day for your weekly review"
              hint="Reviews run at 04:00 India time. The first waits at least seven days. A review may keep your programme unchanged."
            >
              <select
                className={INPUT_CLASS}
                value={answers.reviewWeekday ?? ""}
                onChange={(e) =>
                  change({ reviewWeekday: e.target.value ? Number(e.target.value) : null })
                }
              >
                <option value="">Choose a rest day</option>
                {WEEKDAYS.map((day, i) => (
                  <option key={day} value={i + 1}>
                    {day}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        {step === 2 && (
          <>
            <Field label="Training experience">
              <select
                className={INPUT_CLASS}
                value={answers.experience}
                onChange={(e) =>
                  change({ experience: e.target.value as CoachIntake["experience"] })
                }
              >
                {[
                  ["unknown", "Not sure"],
                  ["beginner", "New to training"],
                  ["intermediate", "Some consistent experience"],
                  ["experienced", "Experienced"],
                  ["returning", "Returning after a break"],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            {text(
              "recentTraining",
              "What have you done recently? (optional)",
              1500,
              "Include any running, time away, or an existing training schedule.",
            )}
            {text(
              "restrictions",
              "Restrictions or movements to avoid (optional)",
              3000,
              "Include any relevant pain, clinician's guidance, or equipment limitations.",
            )}
            {text("preferences", "Exercises you enjoy or dislike (optional)", 2000)}
            <Field
              label="Exclude specific exercises (optional)"
              hint="The coach will leave these out of your programme."
            >
              <select
                className={INPUT_CLASS}
                value=""
                onChange={(event) => {
                  if (event.target.value)
                    change({
                      avoidExerciseSlugs: [...answers.avoidExerciseSlugs, event.target.value],
                    });
                }}
              >
                <option value="">Choose an exercise to avoid</option>
                {library
                  .filter((exercise) => !answers.avoidExerciseSlugs.includes(exercise.slug))
                  .map((exercise) => (
                    <option key={exercise.slug} value={exercise.slug}>
                      {exercise.name}
                    </option>
                  ))}
              </select>
            </Field>
            {answers.avoidExerciseSlugs.map((slug) => (
              <div key={slug} className="flex items-center justify-between gap-2 text-sm">
                <span>{library.find((exercise) => exercise.slug === slug)?.name ?? slug}</span>
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
              </div>
            ))}
            {text("physiqueGoal", "Physique goals (optional)", 1000)}
            <details>
              <summary className="min-h-11 cursor-pointer py-2">Optional body measurements</summary>
              <div className="space-y-4 pt-3">
                <Field label="Age range">
                  <select
                    className={INPUT_CLASS}
                    value={answers.ageRange ?? ""}
                    onChange={(e) =>
                      change({ ageRange: (e.target.value || null) as CoachIntake["ageRange"] })
                    }
                  >
                    {[
                      ["", "Unknown"],
                      ["under_18", "Under 18"],
                      ["18_29", "18–29"],
                      ["30_39", "30–39"],
                      ["40_49", "40–49"],
                      ["50_59", "50–59"],
                      ["60_plus", "60+"],
                      ["prefer_not_to_say", "Prefer not to say"],
                    ].map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                {number("weightKg", "Weight in kg (optional)", 20, 500)}
                {number("heightCm", "Height in cm (optional)", 50, 260)}
                <Field label="Measurement date (optional)">
                  <Input
                    type="date"
                    value={answers.measuredOn ?? ""}
                    onChange={(e) => change({ measuredOn: e.target.value || null })}
                  />
                </Field>
              </div>
            </details>
          </>
        )}
        {step === 3 && (
          <>
            <p className="text-sm text-ink-muted">
              Optional examples help choose starting loads. These are reports, not logged workouts.
              If you don’t know, leave them out; the coach will give calibration guidance.
            </p>
            {answers.baselines.map((lift, i) => (
              <fieldset key={i} className="space-y-3 rounded-control border border-line p-3">
                <legend className="px-1 font-medium">
                  {library.find((e) => e.slug === lift.exerciseSlug)?.name ?? lift.exerciseSlug}
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Load (optional)">
                    <Input
                      type="number"
                      min={0}
                      max={2000}
                      step="any"
                      value={lift.load ?? ""}
                      onChange={(e) =>
                        liftChange(i, { load: e.target.value ? Number(e.target.value) : null })
                      }
                    />
                  </Field>
                  <Field label="Unit">
                    <select
                      className={INPUT_CLASS}
                      value={lift.unit}
                      onChange={(e) => liftChange(i, { unit: e.target.value as "kg" | "lb" })}
                    >
                      <option value="kg">kg</option>
                      <option value="lb">lb</option>
                    </select>
                  </Field>
                  <Field label="Reps (optional)">
                    <Input
                      type="number"
                      min={1}
                      max={200}
                      value={lift.reps ?? ""}
                      onChange={(e) =>
                        liftChange(i, { reps: e.target.value ? Number(e.target.value) : null })
                      }
                    />
                  </Field>
                  <Field
                    label="Reps in reserve (optional)"
                    hint="How many more reps you think you could have done."
                  >
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={lift.rir ?? ""}
                      onChange={(e) =>
                        liftChange(i, { rir: e.target.value ? Number(e.target.value) : null })
                      }
                    />
                  </Field>
                </div>
                <Field label="What does that load mean?">
                  <select
                    className={INPUT_CLASS}
                    value={lift.convention}
                    onChange={(e) =>
                      liftChange(i, { convention: e.target.value as typeof lift.convention })
                    }
                  >
                    {[
                      ["unknown", "Not sure"],
                      ["total", "Total load"],
                      ["per_hand", "Per hand"],
                      ["assistance", "Assistance"],
                      ["bodyweight", "Body weight"],
                      ["stack_label", "Machine stack label"],
                    ].map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Location (optional)">
                  <select
                    className={INPUT_CLASS}
                    value={lift.gymId ?? ""}
                    onChange={(e) =>
                      liftChange(i, { gymId: e.target.value || null, equipmentInstanceId: null })
                    }
                  >
                    <option value="">Unknown</option>
                    {gyms.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Machine (optional)">
                  <select
                    className={INPUT_CLASS}
                    value={lift.equipmentInstanceId ?? ""}
                    onChange={(e) => liftChange(i, { equipmentInstanceId: e.target.value || null })}
                  >
                    <option value="">Unknown / no registered machine</option>
                    {machines
                      .filter((m) => m.gymId === lift.gymId)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="When was this? (optional)">
                  <Input
                    type="date"
                    value={lift.recordedOn ?? ""}
                    onChange={(e) => liftChange(i, { recordedOn: e.target.value || null })}
                  />
                </Field>
                <Field label="Notes (optional)">
                  <Textarea
                    maxLength={500}
                    value={lift.note}
                    onChange={(e) => liftChange(i, { note: e.target.value })}
                  />
                </Field>
                <Button
                  variant="ghost"
                  onClick={() => change({ baselines: answers.baselines.filter((_, n) => i !== n) })}
                >
                  Remove this example
                </Button>
              </fieldset>
            ))}
            {answers.baselines.length < 20 && (
              <>
                <Field label="Add an example lift">
                  <select
                    className={INPUT_CLASS}
                    value={newLift}
                    onChange={(e) => setNewLift(e.target.value)}
                  >
                    <option value="">Choose an exercise</option>
                    {library.map((e) => (
                      <option key={e.slug} value={e.slug}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Button
                  variant="secondary"
                  disabled={!newLift}
                  onClick={() => {
                    change({
                      baselines: [
                        ...answers.baselines,
                        {
                          exerciseSlug: newLift,
                          gymId: null,
                          equipmentInstanceId: null,
                          load: null,
                          unit: preferredUnit,
                          convention: "unknown",
                          reps: null,
                          rir: null,
                          recordedOn: null,
                          note: "",
                        },
                      ],
                    });
                    setNewLift("");
                  }}
                >
                  Add example
                </Button>
              </>
            )}
          </>
        )}
        {step === 4 && (
          <>
            <p className="text-sm text-ink-muted">
              Attach reports or an existing plan. Files stay available for future coaching reviews
              until you remove them. PDF, JPG, PNG or text; up to 3 MB each and five files per
              request.
            </p>
            <Field label="Attach files">
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.txt,.md"
                multiple
                disabled={busy}
                onChange={(e) => {
                  void upload(e.target.files);
                  e.target.value = "";
                }}
              />
            </Field>
            {files.map((file) => (
              <div key={file.id} className="space-y-2 rounded-control bg-surface-raised p-3">
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={answers.attachmentIds.includes(file.id)}
                    className="size-5 shrink-0 accent-[var(--ov-accent)]"
                    disabled={
                      busy ||
                      (!answers.attachmentIds.includes(file.id) &&
                        answers.attachmentIds.length >= 5)
                    }
                    onChange={(e) =>
                      change({
                        attachmentIds: e.target.checked
                          ? [...answers.attachmentIds, file.id]
                          : answers.attachmentIds.filter((id) => id !== file.id),
                      })
                    }
                  />
                  <span className="min-w-0 break-words">{file.name}</span>
                </label>
                <div className="flex items-center justify-between">
                  <a
                    className="text-sm text-accent underline"
                    href={`/api/coaching/attachments/${file.id}`}
                    download
                  >
                    Download
                  </a>
                  <Button variant="ghost" disabled={busy} onClick={() => remove(file)}>
                    Remove file
                  </Button>
                </div>
              </div>
            ))}
          </>
        )}
        {step === 5 && (
          <>
            <p className="text-sm text-ink-muted">
              Programme creation and gym replans share three requests per day, resetting at midnight
              in your time zone.
            </p>
            <p className="text-sm text-ink-muted">
              Confirm these answers to enable daily session preparation and weekly programme
              reviews. You’ll review a new programme before activation; changes to your split or
              schedule will also need your review.
            </p>
            <dl className="space-y-3 text-sm">
              {[
                ["Goal", answers.goal || "Not supplied"],
                ["Priority", answers.priorities || "Not supplied"],
                [
                  "Schedule",
                  `${answers.sessionsPerWeek ?? "?"} sessions · ${answers.minutesPerSession ?? "?"} minutes`,
                ],
                [
                  "Preferred days",
                  answers.preferredDays.map((d) => WEEKDAYS[d - 1]).join(", ") || "Flexible",
                ],
                [
                  "Review day",
                  answers.reviewWeekday
                    ? WEEKDAYS[answers.reviewWeekday - 1]!
                    : "Choose a rest day",
                ],
                ["Location", gyms.find((g) => g.id === answers.gymId)?.name ?? "Choose a location"],
                ["Restrictions", answers.restrictions || "None reported"],
                ["Preferences", answers.preferences || "None reported"],
                [
                  "Excluded exercises",
                  answers.avoidExerciseSlugs
                    .map((slug) => library.find((exercise) => exercise.slug === slug)?.name ?? slug)
                    .join(", ") || "None selected",
                ],
                ["Examples", `${answers.baselines.length} reported lifts`],
                [
                  "Files",
                  files
                    .filter((f) => answers.attachmentIds.includes(f.id))
                    .map((f) => f.name)
                    .join(", ") || "None attached",
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-ink-muted">{label}</dt>
                  <dd className="mt-1 break-words whitespace-pre-wrap">{value}</dd>
                </div>
              ))}
            </dl>
            {answers.prompt && (
              <details>
                <summary className="min-h-11 cursor-pointer py-2">Read your full brief</summary>
                <p className="text-sm break-words whitespace-pre-wrap">{answers.prompt}</p>
              </details>
            )}
            {!configured && (
              <p className="text-sm text-ink-muted">
                Generation is awaiting the coach service setup. You can save your answers and
                reports now, or build your programme manually.
              </p>
            )}
          </>
        )}
      </Card>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-between gap-3">
        <Button variant="secondary" disabled={busy || step === 0} onClick={() => move(step - 1)}>
          Back
        </Button>
        {step < 5 ? (
          <Button disabled={busy} onClick={() => move(step + 1)}>
            {busy ? "Saving…" : "Continue"}
          </Button>
        ) : (
          <Button disabled={busy || !configured} onClick={create}>
            {busy ? "Saving request…" : "Confirm and create my programme"}
          </Button>
        )}
      </div>
      <Button
        variant="ghost"
        disabled={busy}
        onClick={async () => {
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
        }}
      >
        Save and finish later
      </Button>
    </div>
  );
}
