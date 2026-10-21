"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import {
  clockEntry,
  formatDuration,
  parseDuration,
} from "@/components/activities/activity-form-fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SpeechTextarea } from "@/components/ui/dictation";
import { FormError } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { coachIntakeSchema, type CoachIntake } from "@/domain/coaching-workflow";
import {
  RACE_DISTANCE_LABELS,
  RACE_DISTANCE_METRES,
  RACE_DISTANCES,
  raceMetres,
  RUNNING_GOAL_LABELS,
  RUNNING_GOALS,
  RUNNING_PLACES,
  runningIntakeProblems,
  type RaceDistance,
  type RunningGoal,
  type RunningIntake,
  type RunningPlace,
} from "@/domain/running-intake";
import { fromMetres, roundTo, toMetres, type DistanceUnit } from "@/lib/distance-units";
import { formatIsoDate } from "@/lib/format";
import { WEEKDAY_NAMES } from "@/lib/labels";
import {
  createCoachProgramAction,
  saveCoachIntakeAction,
} from "@/server/actions/coaching-workflow";

import { coachingAction } from "./client-action";
import { CoachFilesField, useCoachFiles, type CoachFile } from "./coach-files";
import { CoachAsked } from "./coach-asked";
import { DayPicker } from "./day-picker";

/**
 * Asking the coach for a running programme (ADR 0059): what every running app asks before it
 * builds a plan, in the order a runner thinks about it — what for, how fit, how much now, when.
 *
 * Where the athlete's own logs already answer a question (their usual week, their longest run
 * of the month, a recent fast run), the answer starts filled in and says so beside its label,
 * "From your logs", until it is changed; it stays theirs to change. The goal is also written out in words for the coach, beside the
 * athlete's own, so a reader of the request sees "Marathon on Sun 14 Mar 2027, in 3:45:00".
 *
 * What the strength questions carry and a runner needs as much, it carries too: plans and
 * reports to attach (a watch's export, a race result, a plan to work from), dictation into the
 * long answers, the coach's earlier questions with their answers, and the asking kept in view.
 */

const PLACE_LABELS: Record<RunningPlace, string> = {
  outdoor: "Roads and paths",
  treadmill: "Treadmill",
  track: "Track",
  trail: "Trails",
};

const TERRAIN_LABELS = { flat: "Flat", rolling: "Rolling", hilly: "Hilly" } as const;

const EXPERIENCES = [
  ["unknown", "Not sure"],
  ["beginner", "New to running"],
  ["intermediate", "Run regularly"],
  ["experienced", "Experienced, have raced"],
  ["returning", "Returning after a break"],
] as const;

/** The common distances a recent race is run over, with Another for the rest. */
const EFFORT_DISTANCES = ["5k", "10k", "half_marathon", "marathon", "mile", "other"] as const;

export type RunningSnapshot = {
  weeklyKm: number;
  runsPerWeek: number;
  longest: { km: number; on: string } | null;
  effort: { label: string; metres: number; seconds: number; on: string } | null;
};

type Draft = {
  goal: RunningGoal | "";
  raceDistance: RaceDistance | "";
  raceKm: string;
  raceDate: string;
  goalTime: string;
  effortDistance: (typeof EFFORT_DISTANCES)[number] | "";
  effortKm: string;
  effortTime: string;
  effortOn: string;
  weekly: string;
  longest: string;
  runsPerWeek: string;
  days: number[];
  longRunDay: string;
  minutes: string;
  longRunMinutes: string;
  places: RunningPlace[];
  terrain: "" | "flat" | "rolling" | "hilly";
  experience: string;
  restrictions: string;
  brief: string;
};

const text = (value: number | null | undefined) => (value == null ? "" : String(value));

function effortDistanceOf(metres: number): Draft["effortDistance"] {
  const named = EFFORT_DISTANCES.find(
    (key) => key !== "other" && Math.abs(RACE_DISTANCE_METRES[key] - metres) < 1,
  );
  return named ?? "other";
}

/** The form's opening answers: the saved intake's where there is one, else the logs'. */
function opening(
  saved: CoachIntake,
  snapshot: RunningSnapshot,
  unit: DistanceUnit,
  hasSaved: boolean,
): Draft {
  const entry = saved.sports.find((sport) => sport.sport === "running");
  const goal = entry?.running ?? null;
  const inUnit = (metres: number | null | undefined) =>
    metres == null ? "" : String(roundTo(fromMetres(metres, unit), 1));
  const effort = goal?.recentEffort ?? null;
  const logged = hasSaved ? null : snapshot.effort;
  return {
    goal: goal?.goal ?? "",
    raceDistance: goal?.raceDistance ?? "",
    raceKm: inUnit(goal?.raceDistanceMetres),
    raceDate: goal?.raceDate ?? "",
    goalTime: goal?.goalTimeSeconds ? formatDuration(goal.goalTimeSeconds) : "",
    effortDistance: effort
      ? effortDistanceOf(effort.distanceMetres)
      : logged
        ? effortDistanceOf(logged.metres)
        : "",
    effortKm: inUnit(effort?.distanceMetres ?? logged?.metres),
    effortTime: effort
      ? formatDuration(effort.timeSeconds)
      : logged
        ? formatDuration(logged.seconds)
        : "",
    effortOn: effort?.on ?? logged?.on ?? "",
    weekly:
      goal?.weeklyDistanceMetres != null
        ? inUnit(goal.weeklyDistanceMetres)
        : !hasSaved && snapshot.weeklyKm > 0
          ? inUnit(snapshot.weeklyKm * 1000)
          : "",
    longest:
      goal?.longestRecentMetres != null
        ? inUnit(goal.longestRecentMetres)
        : !hasSaved && snapshot.longest
          ? inUnit(snapshot.longest.km * 1000)
          : "",
    runsPerWeek: text(
      entry?.sessionsPerWeek ?? saved.sessionsPerWeek ?? (snapshot.runsPerWeek || null),
    ),
    days: entry?.preferredDays ?? [],
    longRunDay: text(goal?.longRunDay),
    minutes: text(entry?.minutesPerSession ?? saved.minutesPerSession),
    longRunMinutes: text(goal?.longRunMinutes),
    places: goal?.places ?? [],
    terrain: goal?.terrain ?? "",
    experience: entry?.experience ?? saved.experience,
    restrictions: saved.restrictions,
    brief: saved.prompt,
  };
}

export function RunningIntakeForm({
  initial,
  prefill,
  reports,
  configured,
  snapshot,
  unit,
  today,
}: {
  initial: { id: string; revision: number; answers: CoachIntake } | null;
  prefill: CoachIntake;
  /** The account's kept files; the saved answers say which go with this request. */
  reports: CoachFile[];
  /** Whether the coach can be asked for a programme now; the answers save either way. */
  configured: boolean;
  snapshot: RunningSnapshot;
  unit: DistanceUnit;
  today: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(initial);
  const [requestKey] = useState(() => crypto.randomUUID());
  const [opened] = useState<Draft>(() =>
    opening(initial?.answers ?? prefill, snapshot, unit, initial !== null),
  );
  const [draft, setDraft] = useState<Draft>(opened);
  const files = useCoachFiles(reports, (initial?.answers ?? prefill).attachmentIds, () =>
    setMessage(null),
  );
  const busy = pending || files.busy;
  const set = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(null);
    setMessage(null);
    files.dismiss();
  };
  const metres = (value: string) => {
    const parsed = Number(value.replace(",", "."));
    return value.trim() === "" || !Number.isFinite(parsed) ? null : toMetres(parsed, unit);
  };
  const seconds = (value: string) => {
    const parsed = parseDuration(value);
    return parsed === null || parsed === 0 ? null : Math.round(parsed);
  };
  const unitWord = unit === "mi" ? "miles" : "km";
  const racing = draft.goal === "race" || draft.goal === "faster";
  const ownDistance = draft.raceDistance === "ultra" || draft.raceDistance === "other";

  function running(): RunningIntake {
    const effortMetres =
      draft.effortDistance === "other"
        ? metres(draft.effortKm)
        : draft.effortDistance
          ? RACE_DISTANCE_METRES[draft.effortDistance]
          : null;
    const effortSeconds = seconds(draft.effortTime);
    return {
      goal: draft.goal || null,
      raceDistance: racing && draft.raceDistance ? draft.raceDistance : null,
      raceDistanceMetres:
        racing && ownDistance ? Math.round(metres(draft.raceKm) ?? 0) || null : null,
      raceDate: draft.goal === "race" && draft.raceDate ? draft.raceDate : null,
      goalTimeSeconds: racing ? seconds(draft.goalTime) : null,
      recentEffort:
        effortMetres && effortSeconds
          ? { distanceMetres: effortMetres, timeSeconds: effortSeconds, on: draft.effortOn || null }
          : null,
      weeklyDistanceMetres: (() => {
        const value = metres(draft.weekly);
        return value === null ? null : Math.round(value);
      })(),
      longestRecentMetres: (() => {
        const value = metres(draft.longest);
        return value === null ? null : Math.round(value);
      })(),
      longRunDay: draft.longRunDay ? Number(draft.longRunDay) : null,
      longRunMinutes: draft.longRunMinutes ? Number(draft.longRunMinutes) : null,
      places: draft.places,
      terrain: draft.terrain || null,
    };
  }

  /** The goal in words, for the coach and for whoever reads the request later. */
  function goalWords(answers: RunningIntake): string {
    if (!answers.goal) return "";
    const distance = answers.raceDistance
      ? ["ultra", "other"].includes(answers.raceDistance)
        ? `${roundTo(fromMetres(raceMetres(answers) ?? 0, unit), 1)} ${unitWord}`
        : RACE_DISTANCE_LABELS[answers.raceDistance]
      : null;
    const time = answers.goalTimeSeconds ? `, in ${formatDuration(answers.goalTimeSeconds)}` : "";
    if (answers.goal === "race" && distance && answers.raceDate)
      return `${distance} race on ${formatIsoDate(answers.raceDate)}${time}.`;
    if (answers.goal === "faster" && distance) return `Get faster at the ${distance}${time}.`;
    return `${RUNNING_GOAL_LABELS[answers.goal]}.`;
  }

  async function submit(intent: "save" | "create") {
    files.dismiss();
    const answers = running();
    const problems = runningIntakeProblems(answers, today);
    if (intent === "create" && problems.length > 0) {
      setError(problems.map((problem) => problem.message).join(" "));
      return;
    }
    const runsPerWeek = draft.runsPerWeek ? Number(draft.runsPerWeek) : null;
    const minutes = draft.minutes ? Number(draft.minutes) : null;
    const experience = draft.experience as CoachIntake["experience"];
    const access = draft.places.map((place) => PLACE_LABELS[place]).join(", ");
    const parsed = coachIntakeSchema.safeParse({
      ...(initial?.answers ?? prefill),
      programmeSport: "running",
      scope: "programme",
      track: "detailed",
      goal: goalWords(answers),
      sessionsPerWeek: runsPerWeek,
      minutesPerSession: minutes,
      experience,
      prompt: draft.brief,
      restrictions: draft.restrictions,
      trainingLocation: null,
      gymId: null,
      preferredDays: [],
      runsPerWeek,
      preferredRunDays: draft.days.length === runsPerWeek ? draft.days : [],
      attachmentIds: files.attached,
      sports: [
        {
          sport: "running",
          experience,
          access,
          sessionsPerWeek: runsPerWeek,
          preferredDays: draft.days,
          minutesPerSession: minutes,
          running: answers,
        },
      ],
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

  // Filled in from the logs and not changed since: said in a word or two beside its label.
  const fromLogs = (key: keyof Draft, filled: boolean) =>
    filled && initial === null && draft[key] === opened[key] ? "From your logs" : undefined;

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
            <Select
              value={draft.goal}
              onChange={(event) => set({ goal: event.target.value as RunningGoal | "" })}
              required
            >
              <option value="">Choose</option>
              {RUNNING_GOALS.map((goal) => (
                <option key={goal} value={goal}>
                  {RUNNING_GOAL_LABELS[goal]}
                </option>
              ))}
            </Select>
          </Field>
          {racing && (
            <div className="adaptive-grid">
              <Field label="Distance">
                <Select
                  value={draft.raceDistance}
                  onChange={(event) =>
                    set({ raceDistance: event.target.value as RaceDistance | "" })
                  }
                  required
                >
                  <option value="">Choose</option>
                  {RACE_DISTANCES.map((distance) => (
                    <option key={distance} value={distance}>
                      {RACE_DISTANCE_LABELS[distance]}
                    </option>
                  ))}
                </Select>
              </Field>
              {ownDistance && (
                <Field label={`How far, in ${unitWord}`}>
                  <Input
                    inputMode="decimal"
                    value={draft.raceKm}
                    onChange={(event) => set({ raceKm: event.target.value })}
                    required
                  />
                </Field>
              )}
              {draft.goal === "race" && (
                <Field label="Race date">
                  <Input
                    type="date"
                    min={today}
                    value={draft.raceDate}
                    onChange={(event) => set({ raceDate: event.target.value })}
                    required
                  />
                </Field>
              )}
              <Field label="Goal time" aside="Optional" hint="h:mm:ss, or leave it to the coach.">
                <Input
                  inputMode="numeric"
                  value={draft.goalTime}
                  placeholder="0:00"
                  onChange={(event) => set({ goalTime: clockEntry(event.target.value) })}
                />
              </Field>
            </div>
          )}
          <Field label="In your own words" aside="Optional">
            <SpeechTextarea
              label="your goal in your own words"
              value={draft.brief}
              maxLength={16000}
              rows={3}
              placeholder="For example, a 10K tune-up in May"
              onChange={(brief) => set({ brief })}
            />
          </Field>
          <CoachAsked clarifications={(initial?.answers ?? prefill).clarifications} />
        </Card>
      </Section>

      <Section title="Your fitness now">
        <Card>
          <div className="adaptive-grid">
            <Field
              label="A recent race or time trial"
              // A logged run is not a race: the coach reads it as a floor unless it was all-out.
              aside={
                (draft.effortDistance !== "" &&
                  fromLogs("effortDistance", snapshot.effort !== null) &&
                  fromLogs("effortTime", snapshot.effort !== null)) ||
                "Optional"
              }
              info="A recent race or all-out time trial sets your paces."
              // What a blank does stays in view (DESIGN.md, The Need-to-Know Rule).
              hint={
                draft.effortDistance === ""
                  ? "Without one, the coach plans by effort and adds a time trial."
                  : undefined
              }
            >
              <Select
                value={draft.effortDistance}
                onChange={(event) =>
                  set({ effortDistance: event.target.value as Draft["effortDistance"] })
                }
              >
                <option value="">None recently</option>
                {EFFORT_DISTANCES.map((distance) => (
                  <option key={distance} value={distance}>
                    {RACE_DISTANCE_LABELS[distance]}
                  </option>
                ))}
              </Select>
            </Field>
            {draft.effortDistance === "other" && (
              <Field label={`How far, in ${unitWord}`}>
                <Input
                  inputMode="decimal"
                  value={draft.effortKm}
                  onChange={(event) => set({ effortKm: event.target.value })}
                />
              </Field>
            )}
            {draft.effortDistance !== "" && (
              <>
                <Field label="Time" hint="h:mm:ss">
                  <Input
                    inputMode="numeric"
                    value={draft.effortTime}
                    placeholder="0:00"
                    onChange={(event) => set({ effortTime: clockEntry(event.target.value) })}
                  />
                </Field>
                <Field label="When" aside="Optional">
                  <Input
                    type="date"
                    max={today}
                    value={draft.effortOn}
                    onChange={(event) => set({ effortOn: event.target.value })}
                  />
                </Field>
              </>
            )}
          </div>
          <div className="adaptive-grid">
            <Field
              label={`A usual week, in ${unitWord}`}
              aside={fromLogs("weekly", snapshot.weeklyKm > 0)}
            >
              <Input
                inputMode="decimal"
                value={draft.weekly}
                onChange={(event) => set({ weekly: event.target.value })}
              />
            </Field>
            <Field
              label={`Longest run this month, in ${unitWord}`}
              aside={fromLogs("longest", snapshot.longest !== null)}
            >
              <Input
                inputMode="decimal"
                value={draft.longest}
                onChange={(event) => set({ longest: event.target.value })}
              />
            </Field>
          </div>
          <Field label="Your running">
            <Select
              value={draft.experience}
              onChange={(event) => set({ experience: event.target.value })}
            >
              {EXPERIENCES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </Card>
        <Card>
          <CoachFilesField
            files={files.files}
            attached={files.attached}
            busy={busy}
            error={files.error}
            info="A watch export, a race result or a plan to work from. They stay for later reviews until you remove them."
            onUpload={files.upload}
            onToggle={files.toggle}
            onRemove={files.remove}
          />
        </Card>
      </Section>

      <Section title="When you can run">
        <Card>
          <Field label="Runs a week">
            <Input
              type="number"
              min={1}
              max={7}
              value={draft.runsPerWeek}
              onChange={(event) => set({ runsPerWeek: event.target.value })}
              required
            />
          </Field>
          <DayPicker
            legend="Days you can run (leave empty for any)"
            selected={draft.days}
            onChange={(days) =>
              set({
                days,
                longRunDay:
                  draft.longRunDay && !days.includes(Number(draft.longRunDay))
                    ? ""
                    : draft.longRunDay,
              })
            }
          />
          <div className="adaptive-grid">
            <Field label="Long run day" aside="Optional">
              <Select
                value={draft.longRunDay}
                onChange={(event) => set({ longRunDay: event.target.value })}
              >
                <option value="">Any</option>
                {(draft.days.length ? draft.days : [1, 2, 3, 4, 5, 6, 7]).map((day) => (
                  <option key={day} value={day}>
                    {WEEKDAY_NAMES[day]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Minutes on a usual run">
              <Input
                type="number"
                min={10}
                max={240}
                value={draft.minutes}
                onChange={(event) => set({ minutes: event.target.value })}
                required
              />
            </Field>
            <Field label="Minutes for the long run" aside="Optional">
              <Input
                type="number"
                min={10}
                max={600}
                value={draft.longRunMinutes}
                onChange={(event) => set({ longRunMinutes: event.target.value })}
              />
            </Field>
          </div>
        </Card>
      </Section>

      <Section title="Where you run">
        <Card>
          <fieldset className="min-w-0">
            {/* The section's name says it; the group keeps its name for screen readers. */}
            <legend className="sr-only">Places you can run</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {RUNNING_PLACES.map((place) => (
                <label key={place} className="check-row">
                  <input
                    type="checkbox"
                    className="check-row-box"
                    checked={draft.places.includes(place)}
                    onChange={(event) =>
                      set({
                        places: event.target.checked
                          ? [...draft.places, place]
                          : draft.places.filter((entry) => entry !== place),
                      })
                    }
                  />
                  {PLACE_LABELS[place]}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Terrain" aside="Optional">
            <Select
              value={draft.terrain}
              onChange={(event) => set({ terrain: event.target.value as Draft["terrain"] })}
            >
              <option value="">Not said</option>
              {(Object.keys(TERRAIN_LABELS) as (keyof typeof TERRAIN_LABELS)[]).map((terrain) => (
                <option key={terrain} value={terrain}>
                  {TERRAIN_LABELS[terrain]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Anything that limits your running?" aside="Optional">
            <SpeechTextarea
              label="what limits your running"
              value={draft.restrictions}
              maxLength={3000}
              rows={3}
              placeholder="For example, a tight left calf"
              onChange={(restrictions) => set({ restrictions })}
            />
          </Field>
        </Card>
      </Section>

      {/* The asking, kept in view down a long form, with what came of it (DESIGN.md, Pinned
          actions). Saving stays open while the coach takes no new programmes. */}
      <PinnedActions stack>
        <FormError message={error ?? undefined} />
        {message && (
          <p role="status" className="type-meta-small text-ink-2">
            {message}
          </p>
        )}
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
        <button type="submit" value="save" disabled={busy} className="text-action w-full">
          Save answers
        </button>
      </PinnedActions>
    </form>
  );
}
