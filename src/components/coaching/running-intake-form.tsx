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
import { Disclosure } from "@/components/ui/disclosure";
import { FormError } from "@/components/ui/form";
import { SavedNotice } from "@/components/ui/saved-notice";
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
  RUN_TIME_LIMIT_MINUTES,
  RUNNING_GOAL_LABELS,
  RUNNING_GOALS,
  RUNNING_PLACES,
  runningIntakeProblems,
  runTimeLimits,
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
import { useEditorReady } from "./use-editor-ready";

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
  /** The weekdays the logs show them running on most weeks, Monday first (ADR 0063). */
  days: number[];
};

const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7];

type Draft = {
  goal: RunningGoal | "";
  raceDistance: RaceDistance | "";
  raceKm: string;
  raceDate: string;
  goalTime: string;
  laterDistance: RaceDistance | "";
  laterKm: string;
  laterDate: string;
  effortDistance: (typeof EFFORT_DISTANCES)[number] | "";
  effortKm: string;
  effortTime: string;
  effortOn: string;
  weekly: string;
  longest: string;
  runsPerWeek: string;
  days: number[];
  longRunDay: string;
  /** Each weekday's limit in minutes as typed, blank for none (ADR 0063). */
  limits: Record<number, string>;
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
  const runsPerWeek =
    entry?.sessionsPerWeek ?? saved.sessionsPerWeek ?? (snapshot.runsPerWeek || null);
  // The days the logs show, offered where they hold the runs a week the logs show (ADR 0063).
  const days = entry?.preferredDays.length
    ? entry.preferredDays
    : !hasSaved && snapshot.days.length >= (runsPerWeek ?? 1)
      ? snapshot.days
      : [];
  // An intake from before the limits were asked gives its minutes to the days it offered.
  const limits = runTimeLimits(goal, entry?.minutesPerSession ?? saved.minutesPerSession, days);
  const later = goal?.nextRace ?? null;
  return {
    goal: goal?.goal ?? "",
    raceDistance: goal?.raceDistance ?? "",
    raceKm: inUnit(goal?.raceDistanceMetres),
    raceDate: goal?.raceDate ?? "",
    goalTime: goal?.goalTimeSeconds ? formatDuration(goal.goalTimeSeconds) : "",
    laterDistance: later?.raceDistance ?? "",
    laterKm: inUnit(later?.raceDistanceMetres),
    laterDate: later?.raceDate ?? "",
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
    runsPerWeek: text(runsPerWeek),
    days,
    longRunDay: text(goal?.longRunDay),
    limits: Object.fromEntries(limits.map((limit) => [limit.day, String(limit.minutes)])),
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
  const ready = useEditorReady();
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
  const laterOwnDistance = draft.laterDistance === "ultra" || draft.laterDistance === "other";
  // A limit is asked of each day they can run, or of every day where they named none.
  const limitDays = draft.days.length > 0 ? draft.days : EVERY_DAY;
  const limitOf = (day: number) => {
    const typed = draft.limits[day]?.trim() ?? "";
    const value = Number(typed);
    return typed === "" || !Number.isFinite(value) ? null : Math.round(value);
  };
  const limited = limitDays.filter((day) => limitOf(day) !== null);
  const limitOutOfRange = limited.some((day) => {
    const minutes = limitOf(day)!;
    return minutes < RUN_TIME_LIMIT_MINUTES.min || minutes > RUN_TIME_LIMIT_MINUTES.max;
  });

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
      // The limits on each day replace the long run's minutes (ADR 0063).
      longRunMinutes: null,
      timeLimits: limitDays.flatMap((day) => {
        const minutes = limitOf(day);
        return minutes === null ? [] : [{ day, minutes }];
      }),
      nextRace:
        draft.laterDistance && draft.laterDate
          ? {
              raceDistance: draft.laterDistance,
              raceDistanceMetres:
                draft.laterDistance === "ultra" || draft.laterDistance === "other"
                  ? Math.round(metres(draft.laterKm) ?? 0) || null
                  : null,
              raceDate: draft.laterDate,
            }
          : null,
      places: draft.places,
      terrain: draft.terrain || null,
    };
  }

  /** The goal in words, for the coach and for whoever reads the request later. */
  function goalWords(answers: RunningIntake): string {
    if (!answers.goal) return "";
    const named = (race: Pick<RunningIntake, "raceDistance" | "raceDistanceMetres">) =>
      race.raceDistance
        ? ["ultra", "other"].includes(race.raceDistance)
          ? `${roundTo(fromMetres(raceMetres(race) ?? 0, unit), 1)} ${unitWord}`
          : RACE_DISTANCE_LABELS[race.raceDistance]
        : null;
    const distance = named(answers);
    const time = answers.goalTimeSeconds ? `, in ${formatDuration(answers.goalTimeSeconds)}` : "";
    const goal =
      answers.goal === "race" && distance && answers.raceDate
        ? `${distance} race on ${formatIsoDate(answers.raceDate)}${time}.`
        : answers.goal === "faster" && distance
          ? `Get faster at the ${distance}${time}.`
          : `${RUNNING_GOAL_LABELS[answers.goal]}.`;
    const later = answers.nextRace;
    return later
      ? `${goal} A later race: ${named(later)} on ${formatIsoDate(later.raceDate)}.`
      : goal;
  }

  async function submit(intent: "save" | "create") {
    files.dismiss();
    const answers = running();
    const runsPerWeek = draft.runsPerWeek ? Number(draft.runsPerWeek) : null;
    // What could not be saved even as a draft, then what the coach could not plan from.
    const refused = [
      draft.laterDistance && !draft.laterDate ? "Choose the later race's date." : null,
      limitOutOfRange
        ? `Give each time limit from ${RUN_TIME_LIMIT_MINUTES.min} to ${RUN_TIME_LIMIT_MINUTES.max} minutes.`
        : null,
    ];
    const problems = [
      ...runningIntakeProblems(answers, today).map((problem) => problem.message),
      runsPerWeek && draft.days.length > 0 && draft.days.length < runsPerWeek
        ? `Choose at least ${runsPerWeek} days you can run, or leave them empty.`
        : null,
    ];
    const issues = [...refused, ...(intent === "create" ? problems : [])].filter(
      (issue): issue is string => issue !== null,
    );
    if (issues.length > 0) {
      setError(issues.join(" "));
      return;
    }
    const experience = draft.experience as CoachIntake["experience"];
    const access = draft.places.map((place) => PLACE_LABELS[place]).join(", ");
    const parsed = coachIntakeSchema.safeParse({
      ...(initial?.answers ?? prefill),
      programmeSport: "running",
      scope: "programme",
      track: "detailed",
      goal: goalWords(answers),
      sessionsPerWeek: runsPerWeek,
      // A runner's time is each day's limit, in the running answers (ADR 0063).
      minutesPerSession: null,
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
          minutesPerSession: null,
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
          {draft.goal !== "" && (
            <div className="adaptive-grid">
              <Field
                label="A later race"
                aside="Optional"
                info="One after this, such as a marathon in the spring. This programme still ends with your goal and leads into it."
              >
                <Select
                  value={draft.laterDistance}
                  onChange={(event) =>
                    set({ laterDistance: event.target.value as RaceDistance | "" })
                  }
                >
                  <option value="">None</option>
                  {RACE_DISTANCES.map((distance) => (
                    <option key={distance} value={distance}>
                      {RACE_DISTANCE_LABELS[distance]}
                    </option>
                  ))}
                </Select>
              </Field>
              {laterOwnDistance && (
                <Field label={`How far, in ${unitWord}`}>
                  <Input
                    inputMode="decimal"
                    value={draft.laterKm}
                    onChange={(event) => set({ laterKm: event.target.value })}
                  />
                </Field>
              )}
              {draft.laterDistance !== "" && (
                <Field label="Its date" info="A rough date will do.">
                  <Input
                    type="date"
                    min={draft.goal === "race" && draft.raceDate ? draft.raceDate : today}
                    value={draft.laterDate}
                    onChange={(event) => set({ laterDate: event.target.value })}
                  />
                </Field>
              )}
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
            aside={fromLogs("days", opened.days.length > 0)}
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
          <Field label="Long run day" aside="Optional">
            <Select
              value={draft.longRunDay}
              onChange={(event) => set({ longRunDay: event.target.value })}
            >
              <option value="">Any</option>
              {limitDays.map((day) => (
                <option key={day} value={day}>
                  {WEEKDAY_NAMES[day]}
                </option>
              ))}
            </Select>
          </Field>
          {/* A runner's time is a limit on the days that have one, and none is asked for: the
              coach sizes every other run (ADR 0063). */}
          <Disclosure
            summary="Any days with a time limit?"
            meta={
              limited.length === 0
                ? "None"
                : `${limited.length} ${limited.length === 1 ? "day" : "days"}`
            }
            defaultOpen={Object.keys(opened.limits).length > 0 || limitOutOfRange}
            variant="footer"
          >
            <fieldset className="min-w-0 space-y-3">
              <legend className="sr-only">Each day&rsquo;s time limit, in minutes</legend>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,9rem),1fr))] gap-3">
                {limitDays.map((day) => (
                  <Field key={day} label={`${WEEKDAY_NAMES[day]} (minutes)`} aside="Optional">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={RUN_TIME_LIMIT_MINUTES.min}
                      max={RUN_TIME_LIMIT_MINUTES.max}
                      value={draft.limits[day] ?? ""}
                      onChange={(event) =>
                        set({ limits: { ...draft.limits, [day]: event.target.value } })
                      }
                    />
                  </Field>
                ))}
              </div>
              {/* What a blank does stays in view (DESIGN.md, The Need-to-Know Rule). */}
              <p className="text-[length:var(--ov-type-caption)] font-medium text-ink-2">
                A day left blank has no limit.
              </p>
            </fieldset>
          </Disclosure>
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
