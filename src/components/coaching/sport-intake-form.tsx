"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ACTIVITY_SPORT_LABELS, type ActivitySport } from "@/domain/activity";
import { coachIntakeSchema, type CoachIntake } from "@/domain/coaching-workflow";
import {
  createCoachProgramAction,
  saveCoachIntakeAction,
} from "@/server/actions/coaching-workflow";
import { coachingAction } from "./client-action";

export function SportIntakeForm({
  sport,
  scope,
  initial,
  prefill,
}: {
  sport: ActivitySport;
  scope: "programme" | "session";
  initial: { id: string; revision: number; answers: CoachIntake } | null;
  prefill: CoachIntake;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(initial);
  const [requestKey] = useState(() => crypto.randomUUID());
  const values = initial?.answers ?? prefill;
  async function submit(form: FormData) {
    const number = (key: string) => (form.get(key) ? Number(form.get(key)) : null);
    const parsed = coachIntakeSchema.safeParse({
      ...values,
      programmeSport: sport,
      scope,
      track: "detailed",
      goal: form.get("goal"),
      sessionsPerWeek: scope === "session" ? 1 : number("sessionsPerWeek"),
      minutesPerSession: number("minutesPerSession"),
      experience: form.get("experience"),
      prompt: form.get("prompt"),
      restrictions: form.get("restrictions"),
      ...(sport === "strength"
        ? {
            trainingLocation: form.get("trainingLocation"),
            heightCm: number("heightCm"),
            weightKg: number("weightKg"),
            ageYears: number("ageYears"),
          }
        : { trainingLocation: null, gymId: null }),
      sports: [
        {
          sport,
          experience: form.get("experience"),
          access: form.get("access"),
          sessionsPerWeek: scope === "session" ? 1 : number("sessionsPerWeek"),
          minutesPerSession: number("minutesPerSession"),
        },
      ],
      preferredDays: [],
      preferredRunDays: [],
      runsPerWeek: null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(" "));
      return;
    }
    const result = await coachingAction(() =>
      saveCoachIntakeAction(parsed.data, saved?.revision ?? null),
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(result.value);
    if (form.get("intent") === "save") {
      setMessage("Answers saved.");
      setError(null);
      return;
    }
    const created = await coachingAction(() =>
      createCoachProgramAction(result.value.id, requestKey),
    );
    if (created.ok) router.push(`/plan/requests/${created.value.jobId}` as Route);
    else setError(created.error);
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(
          event.currentTarget,
          (event.nativeEvent as SubmitEvent).submitter,
        );
        start(() => submit(form));
      }}
      className="space-y-4"
    >
      <Field label="What are you training for?">
        <Textarea name="goal" defaultValue={values.goal} maxLength={1500} required />
      </Field>
      <div className="adaptive-grid">
        {scope !== "session" && (
          <Field label="Sessions a week">
            <Input
              name="sessionsPerWeek"
              type="number"
              min={1}
              max={7}
              defaultValue={values.sessionsPerWeek ?? ""}
              required
            />
          </Field>
        )}
        <Field label="Minutes per session">
          <Input
            name="minutesPerSession"
            type="number"
            min={10}
            max={240}
            defaultValue={values.minutesPerSession ?? ""}
            required
          />
        </Field>
      </div>
      <Field label={`Your experience in ${ACTIVITY_SPORT_LABELS[sport].toLowerCase()}`}>
        <Select name="experience" defaultValue={values.experience}>
          <option value="unknown">Not sure</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="experienced">Experienced</option>
          <option value="returning">Returning after a break</option>
        </Select>
      </Field>
      <Field label="Where and with what can you train?" aside="Optional">
        <Textarea
          name="access"
          defaultValue={values.sports.find((entry) => entry.sport === sport)?.access ?? ""}
          maxLength={600}
          placeholder={
            sport === "swimming"
              ? "For example, a 25 m pool"
              : sport === "cycling"
                ? "For example, a road bike and an indoor trainer"
                : "For example, a gym near work"
          }
        />
      </Field>
      {sport === "strength" && (
        <>
          <Field label="Where you train">
            <Select name="trainingLocation" defaultValue={values.trainingLocation ?? ""} required>
              <option value="">Choose</option>
              <option value="gym">Gym</option>
              <option value="home">Home</option>
            </Select>
          </Field>
          <div className="adaptive-grid">
            <Field label="Height (cm)">
              <Input
                name="heightCm"
                type="number"
                min={50}
                max={260}
                defaultValue={values.heightCm ?? ""}
                required
              />
            </Field>
            <Field label="Weight (kg)">
              <Input
                name="weightKg"
                type="number"
                step="any"
                min={20}
                max={500}
                defaultValue={values.weightKg ?? ""}
                required
              />
            </Field>
            <Field label="Age">
              <Input
                name="ageYears"
                type="number"
                min={10}
                max={100}
                defaultValue={values.ageYears ?? ""}
                required
              />
            </Field>
          </div>
        </>
      )}
      <Field label="Anything that limits your training?" aside="Optional">
        <Textarea
          name="restrictions"
          defaultValue={values.restrictions}
          maxLength={3000}
          placeholder="For example, a sore left knee"
        />
      </Field>
      <Field
        label="Your brief"
        aside="Optional"
        info="Days you can train, recent sessions, event dates: anything the coach should know."
      >
        <Textarea name="prompt" defaultValue={values.prompt} maxLength={16000} rows={6} />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="create" disabled={pending}>
          {pending ? "Saving…" : `Ask the coach for a ${scope}`}
        </Button>
        <Button type="submit" name="intent" value="save" variant="secondary" disabled={pending}>
          Save answers
        </Button>
      </div>
    </form>
  );
}
