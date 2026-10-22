"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SpeechTextarea } from "@/components/ui/dictation";
import { FormError } from "@/components/ui/form";
import { SavedNotice } from "@/components/ui/saved-notice";
import { Field, Input, Textarea } from "@/components/ui/input";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import {
  coachIntakeSchema,
  validateIntake,
  type CoachIntake,
  type SportIntake,
} from "@/domain/coaching-workflow";
import {
  createCoachProgramAction,
  saveCoachIntakeAction,
} from "@/server/actions/coaching-workflow";
import { coachingAction } from "./client-action";
import { CoachAsked } from "./coach-asked";
import { CoachFilesField, useCoachFiles, type CoachFile } from "./coach-files";
import { DayPicker } from "./day-picker";
import { useEditorReady } from "./use-editor-ready";

type Sport = "cycling" | "swimming";

/** Each sport's words for the same questions: a ride is not a swim. */
const WORDS = {
  cycling: {
    goal: "For example, a 100 km sportive in June",
    experience: [
      ["unknown", "Not sure"],
      ["beginner", "New to cycling"],
      ["intermediate", "Ride regularly"],
      ["experienced", "Experienced, have raced"],
      ["returning", "Returning after a break"],
    ],
    now: "What you ride now",
    nowExample: "For example, three rides a week, the longest about two hours",
    nowInfo: "Rough numbers are fine; your logged rides correct them.",
    files:
      "A bike computer's export, a power test or a plan to work from. They stay for later reviews until you remove them.",
    when: "When you can ride",
    perWeek: "Rides a week",
    days: "Days you can ride (leave empty for any)",
    minutes: "Minutes on a usual ride",
    where: "Where you ride",
    access: "Where and with what can you ride?",
    accessExample: "For example, a road bike and an indoor trainer",
    limits: "Anything that limits your riding?",
    limitsSpoken: "what limits your riding",
    limitsExample: "For example, a stiff lower back on long rides",
  },
  swimming: {
    goal: "For example, an open-water mile in August",
    experience: [
      ["unknown", "Not sure"],
      ["beginner", "New to swimming"],
      ["intermediate", "Swim regularly"],
      ["experienced", "Experienced, have raced"],
      ["returning", "Returning after a break"],
    ],
    now: "What you swim now",
    nowExample: "For example, 2,000 m twice a week, 100 m in about 1:55",
    nowInfo: "Rough numbers are fine; your logged swims correct them.",
    files:
      "A watch export, a swim test or a plan to work from. They stay for later reviews until you remove them.",
    when: "When you can swim",
    perWeek: "Swims a week",
    days: "Days you can swim (leave empty for any)",
    minutes: "Minutes on a usual swim",
    where: "Where you swim",
    access: "Where and with what can you swim?",
    accessExample: "For example, a 25 m pool and a lake in summer",
    limits: "Anything that limits your swimming?",
    limitsSpoken: "what limits your swimming",
    limitsExample: "For example, a sore right shoulder",
  },
} as const;

type Draft = {
  goal: string;
  brief: string;
  experience: CoachIntake["experience"];
  recentTraining: string;
  perWeek: string;
  days: number[];
  minutes: string;
  access: string;
  restrictions: string;
};

const text = (value: number | null | undefined) => (value == null ? "" : String(value));
const whole = (value: string) => (value.trim() === "" ? null : Number(value));

/**
 * Asking the coach for a ride or swim programme. Strength asks its own questions
 * (`StrengthCoachIntake`), and running its own (`RunningIntakeForm`); this asks the same things
 * in the order a runner is asked them, in the sport's words: what for, where you are now, when,
 * and where. What the strength questions carry, a rider or swimmer needs as much, so it carries
 * it too: where you are now in your own words, plans and reports to attach (a watch's export, a
 * test, a plan to work from), the days you can train, dictation into the long answers, the
 * coach's earlier questions with their answers, and the asking kept in view.
 */
export function SportIntakeForm({
  sport,
  initial,
  prefill,
  reports,
  configured,
}: {
  sport: Sport;
  initial: { id: string; revision: number; answers: CoachIntake } | null;
  prefill: CoachIntake;
  /** The account's kept files; the saved answers say which go with this request. */
  reports: CoachFile[];
  /** Whether the coach can be asked for a programme now; the answers save either way. */
  configured: boolean;
}) {
  const words = WORDS[sport];
  const router = useRouter();
  const ready = useEditorReady();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(initial);
  const [requestKey] = useState(() => crypto.randomUUID());
  const values = initial?.answers ?? prefill;
  const entry = values.sports.find((answer) => answer.sport === sport);
  const [draft, setDraft] = useState<Draft>(() => ({
    goal: values.goal,
    brief: values.prompt,
    experience: entry?.experience ?? values.experience,
    recentTraining: values.recentTraining,
    perWeek: text(entry?.sessionsPerWeek ?? values.sessionsPerWeek),
    days: entry?.preferredDays ?? [],
    minutes: text(entry?.minutesPerSession ?? values.minutesPerSession),
    access: entry?.access ?? "",
    restrictions: values.restrictions,
  }));
  const files = useCoachFiles(reports, values.attachmentIds, () => setMessage(null));
  const busy = pending || files.busy;
  const set = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(null);
    setMessage(null);
    files.dismiss();
  };

  async function submit(intent: "save" | "create") {
    files.dismiss();
    const perWeek = whole(draft.perWeek);
    const minutes = whole(draft.minutes);
    const answer: SportIntake = {
      ...(entry ?? { notes: "", running: null }),
      sport,
      experience: draft.experience,
      access: draft.access,
      sessionsPerWeek: perWeek,
      preferredDays: draft.days,
      minutesPerSession: minutes,
    };
    const answers = {
      ...values,
      programmeSport: sport,
      scope: "programme",
      track: "detailed",
      goal: draft.goal,
      prompt: draft.brief,
      experience: draft.experience,
      recentTraining: draft.recentTraining,
      restrictions: draft.restrictions,
      sessionsPerWeek: perWeek,
      minutesPerSession: minutes,
      trainingLocation: null,
      gymId: null,
      sports: [answer],
      preferredDays: [],
      preferredRunDays: [],
      runsPerWeek: null,
      attachmentIds: files.attached,
    };
    let parsed: CoachIntake;
    try {
      // Asking needs the answers the coach cannot plan without; saving keeps whatever is there.
      parsed = intent === "create" ? validateIntake(answers) : coachIntakeSchema.parse(answers);
    } catch (e) {
      setError(
        e && typeof e === "object" && "issues" in e
          ? (e.issues as { message: string }[]).map((issue) => issue.message).join(" ")
          : "Check your answers.",
      );
      return;
    }
    const result = await coachingAction(() =>
      saveCoachIntakeAction(parsed, saved?.revision ?? null),
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(result.value);
    if (intent === "save") {
      setMessage("Answers saved.");
      return;
    }
    const created = await coachingAction(() =>
      createCoachProgramAction(result.value.id, requestKey),
    );
    if (created.ok) router.push(`/plan/requests/${created.value.jobId}` as Route);
    else setError(created.error);
  }

  if (!ready) return <p role="status">Opening your questions…</p>;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        start(() => submit(submitter?.value === "save" ? "save" : "create"));
      }}
      className="space-y-[var(--section-gap)]"
    >
      <Section title="Your goal">
        <Card>
          <Field label="What are you training for?">
            <Textarea
              value={draft.goal}
              maxLength={1500}
              rows={2}
              placeholder={words.goal}
              onChange={(event) => set({ goal: event.target.value })}
              required
            />
          </Field>
          <Field
            label="Your brief"
            aside="Optional"
            info="Event dates, sessions you enjoy or avoid: anything the coach should know."
          >
            <SpeechTextarea
              label="your brief"
              value={draft.brief}
              maxLength={16000}
              rows={4}
              onChange={(brief) => set({ brief })}
            />
          </Field>
          <CoachAsked clarifications={values.clarifications} />
        </Card>
      </Section>

      <Section title="Your fitness now">
        <Card>
          <Field label={`Your ${sport}`}>
            <Select
              value={draft.experience}
              onChange={(event) =>
                set({ experience: event.target.value as CoachIntake["experience"] })
              }
            >
              {words.experience.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={words.now} aside="Optional" info={words.nowInfo}>
            <SpeechTextarea
              label={words.now.toLowerCase()}
              value={draft.recentTraining}
              maxLength={3000}
              rows={3}
              placeholder={words.nowExample}
              onChange={(recentTraining) => set({ recentTraining })}
            />
          </Field>
        </Card>
        <Card>
          <CoachFilesField
            files={files.files}
            attached={files.attached}
            busy={busy}
            error={files.error}
            info={words.files}
            onUpload={files.upload}
            onToggle={files.toggle}
            onRemove={files.remove}
          />
        </Card>
      </Section>

      <Section title={words.when}>
        <Card>
          <Field label={words.perWeek}>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={7}
              value={draft.perWeek}
              onChange={(event) => set({ perWeek: event.target.value })}
              required
            />
          </Field>
          <DayPicker legend={words.days} selected={draft.days} onChange={(days) => set({ days })} />
          <Field label={words.minutes}>
            <Input
              type="number"
              inputMode="numeric"
              min={10}
              max={240}
              value={draft.minutes}
              onChange={(event) => set({ minutes: event.target.value })}
              required
            />
          </Field>
        </Card>
      </Section>

      <Section title={words.where}>
        <Card>
          <Field label={words.access} aside="Optional">
            <Textarea
              value={draft.access}
              maxLength={600}
              rows={2}
              placeholder={words.accessExample}
              onChange={(event) => set({ access: event.target.value })}
            />
          </Field>
          <Field label={words.limits} aside="Optional">
            <SpeechTextarea
              label={words.limitsSpoken}
              value={draft.restrictions}
              maxLength={3000}
              rows={3}
              placeholder={words.limitsExample}
              onChange={(restrictions) => set({ restrictions })}
            />
          </Field>
        </Card>
      </Section>

      {/* The asking, kept in view down a long form, with what came of it (DESIGN.md, Pinned
          actions). Saving stays open while the coach takes no new programmes. */}
      <PinnedActions stack>
        <FormError message={error ?? undefined} />
        {message && <SavedNotice>{message}</SavedNotice>}
        {!configured && (
          <p className="type-meta-small text-ink-2">
            The coach is not taking new programmes right now.
          </p>
        )}
        <Button
          type="submit"
          value="create"
          size="lg"
          className="w-full"
          disabled={busy || !configured}
          aria-busy={pending}
        >
          {pending ? "Saving…" : "Ask the coach for a programme"}
        </Button>
        <button
          type="submit"
          value="save"
          formNoValidate
          disabled={busy}
          className="text-action w-full"
        >
          Save answers
        </button>
      </PinnedActions>
    </form>
  );
}
