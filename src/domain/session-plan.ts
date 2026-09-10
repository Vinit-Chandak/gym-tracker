import { z } from "zod";

import type { TargetSet } from "./progression";
import { SET_LIMITS } from "./sets";
import { PLAN_ACTIONS, RUN_MODES, SET_TYPES } from "./types";

/**
 * The plan the AI coach writes for one upcoming session.
 *
 * This is the contract between the coach (a Claude Code routine running on the owner's
 * subscription) and the app. The coach produces this shape; the server checks it against
 * the account's own data — real exercises, machines that exist at the chosen gym, slots of
 * the day being planned — before a row is written. Nothing here enforces coaching rules:
 * the coach's judgement lives in the skill and the athlete's memo, not in validation.
 *
 * Text is kept short on purpose. Numbers live in the structured fields; a note is one line.
 */
export const PLAN_LIMITS = {
  summary: 400,
  note: 200,
  warmupLines: 8,
  warmupLine: 160,
  exercises: 20,
  sets: 12,
  memo: 2500,
  restSeconds: 1200,
} as const;

const slug = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Exercise slugs are lower-case words joined by hyphens");

export const planSetSchema = z.object({
  setType: z.enum(SET_TYPES).default("working"),
  weight: z.number().min(0).max(SET_LIMITS.weight).nullable().default(null),
  reps: z.number().int().min(0).max(SET_LIMITS.reps).nullable().default(null),
  durationSeconds: z.number().int().min(0).max(SET_LIMITS.durationSeconds).nullable().default(null),
  rir: z.number().min(0).max(SET_LIMITS.rir).nullable().default(null),
});

/**
 * The run the coach plans for a day that runs. Duration and distance are both optional: an
 * easy run is often prescribed by time alone, and the app derives pace from what is logged.
 */
export const planRunSchema = z.object({
  mode: z.enum(RUN_MODES).default("outdoor"),
  durationMinutes: z.number().int().min(1).max(600).nullable().default(null),
  distanceKm: z.number().min(0.1).max(100).nullable().default(null),
  rpe: z.number().min(1).max(10).nullable().default(null),
  /** How it should feel, in one line. */
  paceNote: z.string().trim().max(PLAN_LIMITS.note).default(""),
  /** When to cut it short, which is what guards a niggle. */
  stopRule: z.string().trim().max(PLAN_LIMITS.note).default(""),
  note: z.string().trim().max(PLAN_LIMITS.note).default(""),
  /** The programme's planned run this fulfils, so a logged run counts towards the block. */
  programRunId: z.uuid().nullable().default(null),
});

export const planExerciseSchema = z.object({
  /** The programme slot this entry is for; null adds an exercise the day did not plan. */
  slotId: z.uuid().nullable().default(null),
  action: z.enum(PLAN_ACTIONS).default("keep"),
  /** The exercise to do (the slot's own for `keep`, another for `substitute`). */
  exerciseSlug: slug,
  /** The machine to use, when the exercise needs one at this gym. */
  equipmentInstanceId: z.uuid().nullable().default(null),
  /** One short line: what to aim for or why it changed. */
  note: z.string().trim().max(PLAN_LIMITS.note).default(""),
  /** Target per set, in order. Empty leaves the deterministic rule's prefill in place. */
  sets: z.array(planSetSchema).max(PLAN_LIMITS.sets).default([]),
  restSeconds: z.number().int().min(0).max(PLAN_LIMITS.restSeconds).nullable().default(null),
  /** Exercises sharing a label are performed back to back, for this session only. */
  supersetGroup: z.string().trim().max(60).nullable().default(null),
  /** Each set is done on both sides; null keeps whatever the programme's slot says. */
  perSide: z.boolean().nullable().default(null),
});

export const coachPlanSchema = z
  .object({
    /** Two sentences at most: the session in a breath. */
    summary: z.string().trim().min(1).max(PLAN_LIMITS.summary),
    /** The warm-up as short lines, replacing the day's protocol for this session. */
    warmup: z
      .array(z.string().trim().min(1).max(PLAN_LIMITS.warmupLine))
      .max(PLAN_LIMITS.warmupLines)
      .default([]),
    exercises: z.array(planExerciseSchema).max(PLAN_LIMITS.exercises).default([]),
    /** The run, on a day that runs. */
    run: planRunSchema.nullable().default(null),
    /** The athlete's memo, rewritten after planning; omitted leaves the memo unchanged. */
    memo: z.string().trim().max(PLAN_LIMITS.memo).optional(),
  })
  .refine((plan) => plan.exercises.length > 0 || plan.run !== null, {
    message: "A plan needs at least one exercise, or a run.",
    path: ["exercises"],
  });

export type PlanSet = z.output<typeof planSetSchema>;
export type PlanExercise = z.output<typeof planExerciseSchema>;
export type PlanRun = z.output<typeof planRunSchema>;
export type CoachPlan = z.output<typeof coachPlanSchema>;
export type CoachPlanInput = z.input<typeof coachPlanSchema>;

/** A plan exercise as stored, with the library and machine it resolved to. */
export type StoredPlanExercise = PlanExercise & {
  exerciseId: string;
  exerciseName: string;
  equipmentInstanceName: string | null;
  /** The slot's identity across programme versions, so a revision keeps the plan readable. */
  slotLineageId: string | null;
};

/** A plan run as stored. The programme run is kept only when it is really in the programme. */
export type StoredPlanRun = PlanRun;

/** "25 min · 4 km · RPE 3": the run in one line. */
export function runPlanLine(run: PlanRun): string {
  const parts = [
    run.durationMinutes === null ? null : `${run.durationMinutes} min`,
    run.distanceKm === null ? null : `${run.distanceKm} km`,
    run.rpe === null ? null : `RPE ${run.rpe}`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Easy run";
}

/** The plan's per-set targets in the shape the session view prefills from. */
export function planTargets(exercise: Pick<PlanExercise, "sets">): TargetSet[] {
  return exercise.sets.map((set, index) => ({
    setIndex: index + 1,
    setType: set.setType,
    weight: set.weight,
    reps: set.reps,
    rir: set.rir,
    durationSeconds: set.durationSeconds,
  }));
}

/** "3 × 8 @ 70 kg · RIR 2" for the plan's working sets; null when nothing is prescribed. */
export function planLine(exercise: Pick<PlanExercise, "sets">, unit: string): string | null {
  const working = exercise.sets.filter((s) => s.setType !== "warmup");
  const shown = working.length > 0 ? working : exercise.sets;
  if (shown.length === 0) return null;
  const first = shown[0]!;
  const same = (pick: (s: PlanSet) => number | null) => shown.every((s) => pick(s) === pick(first));
  const count = `${shown.length} ×`;
  const volume =
    first.durationSeconds !== null && first.reps === null
      ? same((s) => s.durationSeconds)
        ? `${first.durationSeconds} s`
        : shown.map((s) => `${s.durationSeconds ?? "—"} s`).join(", ")
      : same((s) => s.reps)
        ? `${first.reps ?? "—"}`
        : shown.map((s) => s.reps ?? "—").join("/");
  const load =
    first.weight === null
      ? ""
      : same((s) => s.weight)
        ? ` @ ${first.weight} ${unit}`
        : ` @ ${shown.map((s) => s.weight ?? "—").join("/")} ${unit}`;
  const rir =
    first.rir === null
      ? ""
      : same((s) => s.rir)
        ? ` · RIR ${first.rir}`
        : ` · RIR ${shown.map((s) => s.rir ?? "—").join("/")}`;
  return `${count} ${volume}${load}${rir}`;
}
