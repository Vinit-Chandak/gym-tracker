import { PLAN_LIMITS } from "@/domain/plan-limits";
import { addDays, isoWeekday } from "@/domain/program-calendar";
import {
  BLUEPRINT_VERSION,
  type BlueprintExercise,
  type ProgramBlueprint,
} from "@/domain/program-blueprint";

/*
 * A split as an athlete who already trains describes it (board Your split): their days in order,
 * each named, each with its exercises and their sets, reps and reps in reserve. A day with no
 * exercises is a rest day. It repeats from the day it starts, however many days it has.
 */

export type SplitMeasure = "reps" | "duration" | "distance";

export type SplitExercise = {
  slug: string;
  name: string;
  sets: number;
  measure: SplitMeasure;
  /** Reps, seconds or metres, low to high. */
  range: [number, number];
  /** Reps in reserve, low to high; null for a hold or a carry, which is reported by effort. */
  rir: [number, number] | null;
  rest: [number, number];
};

export type SplitDay = { name: string; exercises: SplitExercise[] };

/** What the library says an exercise usually asks for. */
export type ExerciseDefaults = {
  slug: string;
  name: string;
  defaultPrescriptionType: SplitMeasure;
  defaultRepMin: number | null;
  defaultRepMax: number | null;
  defaultDurationMinSeconds: number | null;
  defaultDurationMaxSeconds: number | null;
  defaultDistanceMinMeters: number | null;
  defaultDistanceMaxMeters: number | null;
  defaultRir: number | null;
  defaultRestSeconds: number | null;
};

/** How many repeats of the split a programme holds: as many as a programme may. */
export const SPLIT_CYCLES = 52;

const pair = (low: number | null, high: number | null, fallback: [number, number]) =>
  low !== null && high !== null && low <= high ? ([low, high] as [number, number]) : fallback;

/** An exercise as it joins a day: three sets of its usual target, a rep or two in reserve. */
export function splitExercise(exercise: ExerciseDefaults): SplitExercise {
  const measure = exercise.defaultPrescriptionType;
  const range =
    measure === "duration"
      ? pair(exercise.defaultDurationMinSeconds, exercise.defaultDurationMaxSeconds, [30, 60])
      : measure === "distance"
        ? pair(exercise.defaultDistanceMinMeters, exercise.defaultDistanceMaxMeters, [20, 40])
        : pair(exercise.defaultRepMin, exercise.defaultRepMax, [8, 12]);
  // Reps in reserve are whole reps on screen: a library default of 1.5 is "1–2", one of 2 is
  // "2–3".
  const reserve = exercise.defaultRir;
  const rir: [number, number] | null =
    measure !== "reps"
      ? null
      : reserve === null
        ? [1, 2]
        : Number.isInteger(reserve)
          ? [reserve, Math.min(10, reserve + 1)]
          : [Math.floor(reserve), Math.ceil(reserve)];
  const rest = exercise.defaultRestSeconds ?? 90;
  return {
    slug: exercise.slug,
    name: exercise.name,
    sets: 3,
    measure,
    range,
    rir,
    rest: [rest, Math.min(PLAN_LIMITS.restSeconds, Math.max(rest, rest + 30))],
  };
}

const span = ([low, high]: readonly [number, number]) =>
  low === high ? String(low) : `${low}–${high}`;

/** "4 × 5–8 @ 1–2 RIR", "3 × 30–60 s", "3 × 20–40 m": the app's notation. */
export function splitPrescription(exercise: SplitExercise): string {
  const target =
    exercise.measure === "duration"
      ? `${span(exercise.range)} s`
      : exercise.measure === "distance"
        ? `${span(exercise.range)} m`
        : span(exercise.range);
  return `${exercise.sets} × ${target}${exercise.rir ? ` @ ${span(exercise.rir)} RIR` : ""}`;
}

/** "Push / Pull / Legs", from the training days' names; "My split" when there are none. */
export function splitName(days: readonly SplitDay[]): string {
  const named = days
    .filter((day) => day.exercises.length > 0)
    .map((day) => day.name.trim())
    .filter(Boolean);
  const name = named.join(" / ");
  return name.length > 0 && name.length <= 120 ? name : "My split";
}

/** What would stop the split from starting, in one sentence, or null. */
export function splitProblem(days: readonly SplitDay[]): string | null {
  if (days.length === 0) return "Add a day.";
  if (!days.some((day) => day.exercises.length > 0))
    return "Add exercises to at least one day. A day without any is a rest day.";
  const crowded = days.findIndex((day) => day.exercises.length > PLAN_LIMITS.exercises);
  if (crowded >= 0)
    return `Day ${crowded + 1} has more than ${PLAN_LIMITS.exercises} exercises. Move some to another day.`;
  return null;
}

/**
 * The split as a programme: its days in order, each starting on the weekday it first falls on,
 * repeated as many times as a programme may run. Rest days carry nothing; every training day's
 * exercises keep their own sets, target, reps in reserve and rest.
 */
export function splitToBlueprint(
  days: readonly SplitDay[],
  startDate: string,
  slugSuffix: string,
): ProgramBlueprint {
  return {
    blueprintVersion: BLUEPRINT_VERSION,
    slug: `split-${
      slugSuffix
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 12) || "own"
    }`,
    name: splitName(days),
    weeks: SPLIT_CYCLES,
    notes: "",
    days: days.map((day, index) => {
      const exercises = day.exercises.map((exercise): BlueprintExercise => ({
        exerciseSlug: exercise.slug,
        sets: exercise.sets,
        ...(exercise.measure === "duration"
          ? { duration: exercise.range }
          : exercise.measure === "distance"
            ? { distance: exercise.range }
            : { reps: exercise.range }),
        rir: exercise.rir,
        rest: exercise.rest,
      }));
      const fallback = exercises.length > 0 ? `Day ${index + 1}` : "Rest";
      return {
        dayIndex: index + 1,
        dayOfWeek: isoWeekday(addDays(startDate, index)),
        name: day.name.trim().slice(0, 80) || fallback,
        focus: "",
        timeNote: "",
        effortNote: "",
        notes: "",
        includesLifting: exercises.length > 0,
        includesRun: false,
        warmupSlug: "",
        exercises,
      };
    }),
    runs: [],
  };
}
