import { z } from "zod";
import { programBlueprintSchema } from "./program-blueprint";
import { coachPlanSchema, planExerciseSchema, planRunSchema } from "./session-plan";
import { BODY_LOAD_UNITS } from "./types";
import { PLAN_LIMITS } from "./plan-limits";

export const COACH_CONTRACT_VERSION = 1;
export const COACH_POLICY_VERSION = "2026-09-12";
export const JOB_KINDS = ["create_program", "prepare_session", "review_program"] as const;
export const JOB_STATUSES = [
  "queued",
  "claimed",
  "succeeded",
  "needs_input",
  "failed",
  "superseded",
] as const;
export const JOB_LEASE_MS = 15 * 60_000;
export const MAX_JOB_ATTEMPTS = 3;

const weekday = z.number().int().min(1).max(7);
const optionalText = (max: number) => z.string().trim().max(max).default("");
export const baselineSchema = z.object({
  exerciseSlug: z.string().min(1).max(120),
  gymId: z.uuid().nullable().default(null),
  equipmentInstanceId: z.uuid().nullable().default(null),
  load: z.number().min(0).max(2000).nullable().default(null),
  unit: z.enum(BODY_LOAD_UNITS),
  convention: z.enum(["total", "per_hand", "assistance", "bodyweight", "stack_label", "unknown"]),
  reps: z.number().int().min(1).max(200).nullable().default(null),
  rir: z.number().min(0).max(10).nullable().default(null),
  recordedOn: z.iso.date().nullable().default(null),
  note: optionalText(500),
});

/** Draft answers may be incomplete. Confirming uses validateIntake, never fabricated defaults. */
export const coachIntakeSchema = z.object({
  goal: optionalText(1500),
  priorities: optionalText(1000),
  experience: z
    .enum(["beginner", "intermediate", "experienced", "returning", "unknown"])
    .default("unknown"),
  recentTraining: optionalText(1500),
  physiqueGoal: optionalText(1000),
  ageRange: z
    .enum(["under_18", "18_29", "30_39", "40_49", "50_59", "60_plus", "prefer_not_to_say"])
    .nullable()
    .default(null),
  weightKg: z.number().min(20).max(500).nullable().default(null),
  heightCm: z.number().min(50).max(260).nullable().default(null),
  measuredOn: z.iso.date().nullable().default(null),
  sessionsPerWeek: z.number().int().min(1).max(7).nullable().default(null),
  preferredDays: z
    .array(weekday)
    .max(7)
    .default([])
    .refine((days) => new Set(days).size === days.length, "Choose each weekday once."),
  minutesPerSession: z.number().int().min(10).max(240).nullable().default(null),
  /**
   * Running, asked for in its own right.
   *
   * A run is not a gym session, and an athlete who lifts four days and runs on two of their
   * rest days was previously unable to say so: the coach had to fold the runs into the
   * lifting days to pass validation, which made those days longer than the athlete had
   * agreed to. Left null, the coach decides, as before.
   */
  runsPerWeek: z.number().int().min(0).max(7).nullable().default(null),
  preferredRunDays: z
    .array(weekday)
    .max(7)
    .default([])
    .refine((days) => new Set(days).size === days.length, "Choose each weekday once."),
  dayMinutes: z
    .array(z.object({ day: weekday, minutes: z.number().int().min(10).max(240) }))
    .max(7)
    .default([])
    .refine(
      (days) => new Set(days.map((entry) => entry.day)).size === days.length,
      "Set the time for each weekday once.",
    ),
  reviewWeekday: weekday.nullable().default(null),
  gymId: z.uuid().nullable().default(null),
  restrictions: optionalText(3000),
  preferences: optionalText(2000),
  avoidExerciseSlugs: z.array(z.string().min(1).max(120)).max(100).default([]),
  baselines: z.array(baselineSchema).max(20).default([]),
  prompt: optionalText(16000),
  attachmentIds: z.array(z.uuid()).max(5).default([]),
});
export type CoachIntake = z.infer<typeof coachIntakeSchema>;

export function validateIntake(input: unknown): CoachIntake {
  return coachIntakeSchema
    .superRefine((answers, ctx) => {
      const required: [keyof CoachIntake, string][] = [
        ["goal", "Tell the coach your main goal."],
        ["sessionsPerWeek", "Choose how often you can train."],
        ["minutesPerSession", "Choose your usual session length."],
        ["reviewWeekday", "Choose your weekly review day."],
        ["gymId", "Choose where you will train."],
      ];
      for (const [key, message] of required)
        if (!answers[key]) ctx.addIssue({ code: "custom", path: [key], message });
      if (
        answers.preferredDays.length > 0 &&
        answers.preferredDays.length !== answers.sessionsPerWeek
      )
        ctx.addIssue({
          code: "custom",
          path: ["preferredDays"],
          message: "Choose as many preferred days as sessions, or leave days flexible.",
        });
      if (
        answers.preferredRunDays.length > 0 &&
        answers.runsPerWeek !== null &&
        answers.preferredRunDays.length !== answers.runsPerWeek
      )
        ctx.addIssue({
          code: "custom",
          path: ["preferredRunDays"],
          message: "Choose as many run days as runs, or leave the days flexible.",
        });
    })
    .parse(input);
}

export const jobTargetSchema = z.object({
  programId: z.uuid().nullable().default(null),
  cycleIndex: z.number().int().min(1).nullable().default(null),
  dayIndex: z.number().int().min(1).nullable().default(null),
  gymId: z.uuid().nullable().default(null),
  batchDate: z.iso.date().nullable().default(null),
  reviewStart: z.iso.datetime().nullable().default(null),
  reviewEnd: z.iso.datetime().nullable().default(null),
  intentId: z.uuid().nullable().default(null),
  reason: z.string().trim().max(200).nullable().default(null),
});
export type JobTarget = z.infer<typeof jobTargetSchema>;

/** Opening plans refer to draft positions, not database IDs that do not exist yet. */
export const openingPlanSchema = z.object({
  dayIndex: z.number().int().min(1).max(31),
  gymId: z.uuid(),
  summary: z.string().trim().min(1).max(PLAN_LIMITS.summary),
  warmup: z
    .array(z.string().trim().min(1).max(PLAN_LIMITS.warmupLine))
    .max(PLAN_LIMITS.warmupLines)
    .default([]),
  exercises: z
    .array(
      planExerciseSchema.omit({ slotId: true }).extend({
        orderIndex: z.number().int().min(1).max(30).nullable().default(null),
      }),
    )
    .max(PLAN_LIMITS.exercises)
    .default([]),
  run: planRunSchema.omit({ programRunId: true }).nullable().default(null),
});
export type OpeningPlan = z.infer<typeof openingPlanSchema>;

const explanation = {
  rationale: z.string().trim().min(1).max(3000),
  evidence: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  uncertainties: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
};
export const coachJobResultSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("program"),
    blueprint: programBlueprintSchema,
    openingPlan: openingPlanSchema.nullable().default(null),
    ...explanation,
  }),
  z.object({ outcome: z.literal("session"), plan: coachPlanSchema, ...explanation }),
  z.object({ outcome: z.literal("no_change"), ...explanation }),
  z.object({
    outcome: z.literal("needs_input"),
    questions: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
    ...explanation,
  }),
  z.object({ outcome: z.literal("deferred"), reason: z.string().trim().min(1).max(500) }),
]);
export type CoachJobResult = z.infer<typeof coachJobResultSchema>;
