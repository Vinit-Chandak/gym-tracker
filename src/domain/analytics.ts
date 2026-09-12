import type { TrainingData, TrainingWorkout } from "@/server/repositories/training-data";
import type { Schedule } from "@/server/repositories/schedule";
import { addDays, todayInTimeZone } from "./program-calendar";
import { weekStart } from "./running";
import { addExerciseVolume, emptyMuscleVolume, type MuscleVolume } from "./muscle-volume";
import { allSlots, slotStatus } from "./schedule";
import type { LoadUnit } from "./types";

export type Point = { date: string; value: number | null };
export type PerformanceSeries = {
  id: string;
  exerciseId: string;
  name: string;
  machine: string;
  unit: LoadUnit;
  load: Point[];
  reps: Point[];
  estimated1RM: Point[];
  volume: Point[];
  rir: Point[];
};
const round = (n: number) => Math.round(n * 10) / 10;
const mean = (values: (number | null)[]) => {
  const known = values.filter((n): n is number => n !== null);
  return known.length ? round(known.reduce((a, b) => a + b, 0) / known.length) : null;
};

/** Epley estimate only for loaded barbell sets of 1–10 reps; never includes bodyweight or stack units. */
export function estimated1RM(
  weight: number | null,
  reps: number | null,
  modality: string,
  unit: string,
): number | null {
  if (
    modality !== "barbell" ||
    !["kg", "lb"].includes(unit) ||
    weight === null ||
    weight <= 0 ||
    reps === null ||
    reps < 1 ||
    reps > 10
  )
    return null;
  return round(reps === 1 ? weight : weight * (1 + reps / 30));
}

/**
 * One point per finished session, for every exercise / machine / unit combination logged in
 * `workouts`, oldest point first and sorted by exercise name.
 *
 * The Progress screen charts whichever exercise you pick from all of them; an exercise's own
 * page passes `exerciseId` and charts that one. Both read the same numbers from the same
 * code, so a load on one screen can never disagree with the load on the other.
 */
export function performanceSeries(
  workouts: readonly TrainingWorkout[],
  timeZone: string,
  exerciseId?: string,
): PerformanceSeries[] {
  const series = new Map<string, PerformanceSeries>();
  const finished = workouts
    .filter((w) => w.completedAt !== null)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  for (const workout of finished) {
    const date = todayInTimeZone(timeZone, workout.startedAt);
    for (const slot of workout.exercises) {
      if (exerciseId !== undefined && slot.exerciseId !== exerciseId) continue;
      const working = slot.sets.filter((s) => s.setType !== "warmup");
      for (const unit of new Set(working.map((s) => s.unit))) {
        const machineKey =
          slot.exercise.loadPortability === "global"
            ? "global"
            : (slot.equipment?.id ?? `unknown:${slot.id}`);
        const id = `${slot.exerciseId}:${machineKey}:${unit}`;
        const entry = series.get(id) ?? {
          id,
          exerciseId: slot.exerciseId,
          name: slot.exercise.name,
          machine:
            machineKey === "global"
              ? "Across gyms"
              : `${slot.equipment?.name ?? "Unrecorded machine (this session only)"} · ${workout.gym.name}`,
          unit,
          load: [],
          reps: [],
          estimated1RM: [],
          volume: [],
          rir: [],
        };
        const sets = working.filter((s) => s.unit === unit);
        const weights = sets.flatMap((s) => (s.weight === null ? [] : [s.weight]));
        const reps = sets.flatMap((s) => (s.reps === null ? [] : [s.reps]));
        const estimates = sets.flatMap((s) => {
          const value = estimated1RM(s.weight, s.reps, slot.exercise.modality, unit);
          return value === null ? [] : [value];
        });
        const volume = sets.filter((s) => s.weight !== null && s.reps !== null);
        entry.load.push({ date, value: weights.length ? Math.max(...weights) : null });
        entry.reps.push({ date, value: reps.length ? Math.max(...reps) : null });
        entry.estimated1RM.push({ date, value: estimates.length ? Math.max(...estimates) : null });
        entry.volume.push({
          date,
          value: volume.length ? round(volume.reduce((n, s) => n + s.weight! * s.reps!, 0)) : null,
        });
        entry.rir.push({ date, value: mean(sets.map((s) => s.rir)) });
        series.set(id, entry);
      }
    }
  }
  return [...series.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Calendar weeks and raw measurement gaps are preserved; unrelated machines and units never mix. */
export function trainingAnalytics(data: TrainingData, timeZone: string, from: string, to: string) {
  const weeks = new Map<
    string,
    {
      date: string;
      workouts: number;
      runs: number;
      runKm: number;
      runMinutes: number;
      muscles: MuscleVolume;
    }
  >();
  for (let date = weekStart(from); date <= to; date = addDays(date, 7))
    weeks.set(date, {
      date,
      workouts: 0,
      runs: 0,
      runKm: 0,
      runMinutes: 0,
      muscles: emptyMuscleVolume(),
    });
  const finished = data.workouts.filter((w) => w.completedAt !== null);
  for (const workout of finished) {
    const week = weeks.get(weekStart(todayInTimeZone(timeZone, workout.startedAt)));
    if (!week) continue;
    week.workouts++;
    for (const slot of workout.exercises) {
      // Same weighting the body map uses, so the two views never disagree.
      addExerciseVolume(week.muscles, {
        primaryMuscles: slot.exercise.primaryMuscles,
        secondaryMuscles: slot.exercise.secondaryMuscles ?? [],
        workingSets: slot.sets.filter((s) => s.setType !== "warmup").length,
      });
    }
  }
  for (const run of data.runs) {
    const week = weeks.get(weekStart(todayInTimeZone(timeZone, run.startedAt)));
    if (week) {
      week.runs++;
      week.runKm += run.distanceMeters / 1000;
      week.runMinutes += run.durationSeconds / 60;
    }
  }
  const recovery = [
    ...data.workouts.map((w) => ({
      date: todayInTimeZone(timeZone, w.startedAt),
      source: "Workout check-in",
      sleep: w.sleepHours,
      back: w.backPainPre,
      leftShin: w.shinLeftPre,
      rightShin: w.shinRightPre,
    })),
    ...data.recovery.map((r) => ({
      date: r.date,
      source: "Daily recovery",
      sleep: r.sleepHours,
      back: r.backPain,
      leftShin: r.shinLeft,
      rightShin: r.shinRight,
    })),
    ...data.runs.map((r) => ({
      date: todayInTimeZone(timeZone, r.startedAt),
      source: "Run (after)",
      sleep: null,
      back: null,
      leftShin: r.shinLeftPost,
      rightShin: r.shinRightPost,
    })),
  ]
    .filter((r) => [r.sleep, r.back, r.leftShin, r.rightShin].some((v) => v !== null))
    .sort((a, b) => a.date.localeCompare(b.date));
  const trainingDays = new Set([
    ...finished.map((w) => todayInTimeZone(timeZone, w.startedAt)),
    ...data.runs.map((r) => todayInTimeZone(timeZone, r.startedAt)),
  ]);
  return {
    workouts: finished.length,
    runs: data.runs.length,
    trainingDays: trainingDays.size,
    averageSleep: mean(recovery.map((r) => r.sleep)),
    weeks: [...weeks.values()].map((w) => ({
      ...w,
      runKm: round(w.runKm),
      runMinutes: round(w.runMinutes),
    })),
    series: performanceSeries(data.workouts, timeZone),
    recovery,
    pace: [...data.runs]
      .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
      .map((r) => ({
        date: todayInTimeZone(timeZone, r.startedAt),
        value: r.averagePaceSecondsPerKm === null ? null : round(r.averagePaceSecondsPerKm / 60),
        mode: r.mode,
      })),
    truncated: data.truncated,
  };
}

/** All-programme lifting progress; excludes soft rest slots and future calendar assumptions. */
export function liftingAdherence(schedule: Schedule | null) {
  if (!schedule) return null;
  const liftingDays = new Set(
    schedule.days.filter((d) => d.includesLifting).map((d) => d.dayIndex),
  );
  const slots = allSlots(schedule.state).filter((s) => liftingDays.has(s.dayIndex));
  const completed = slots.filter((s) => slotStatus(schedule.state, s) === "completed").length;
  const skipped = slots.filter((s) => slotStatus(schedule.state, s) === "skipped").length;
  return {
    name: schedule.program.name,
    total: slots.length,
    completed,
    skipped,
    remaining: slots.length - completed - skipped,
    completionRate:
      completed + skipped ? Math.round((completed / (completed + skipped)) * 100) : null,
  };
}
