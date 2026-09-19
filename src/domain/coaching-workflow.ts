import { z } from "zod";
import { programBlueprintSchema } from "./program-blueprint";
import {
  coachPlanSchema,
  planExerciseSchema,
  planRunSchema,
  sportSummariesSchema,
} from "./session-plan";
import { PLAN_LIMITS } from "./plan-limits";
import { memoryPatchSchema, sourceQuoteSchema } from "./coach-memory";
import { requestPatchSchema } from "./program-request";

export const COACH_CONTRACT_VERSION = 4;

/**
 * Whether the server is serving a contract this checkout was written against.
 *
 * The routine clones the repository to read its skill, and the app deploys on its own
 * schedule, so the two drift apart. When they did, a run followed a skill that still named
 * `memory.reviewedNoteIds` and knew nothing of `memo.notes.training` against a server that had
 * moved on — and found out the expensive way: a complete session computed, rejected on
 * validation, corrected twice against guessed field names, then lost with the lease. Both the
 * contract and every job context have always carried the version; it simply had nothing to
 * disagree with. This constant ships in the same checkout as the skill, so comparing the two
 * names a stale clone before an attempt is spent discovering it.
 */
export function contractSkew(served: number): string | null {
  if (served === COACH_CONTRACT_VERSION) return null;
  const stale = served > COACH_CONTRACT_VERSION;
  return (
    `Contract version ${served} from the coach service, ${COACH_CONTRACT_VERSION} in this checkout. ` +
    (stale
      ? "This routine is running a stale clone, so its skill describes fields the server no longer accepts. Re-run it on the repository's default branch."
      : "This checkout is ahead of the deployed app. Wait for the deployment to finish.") +
    " Stop and report the skew; do not guess at field names."
  );
}
export const COACH_POLICY_VERSION = "2026-09-19.1";
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

/**
 * Reports an athlete attaches. The byte ceiling is read by the browser before it uploads, by
 * the route as the stream arrives, and by the repository before the row is written, so it
 * lives here rather than in any one of them.
 */
export const MAX_COACH_FILE_BYTES = 5 * 1024 * 1024;
/** Kept per account for later reviews, and carried by one creation request. */
export const MAX_COACH_FILES = 20;
export const MAX_REQUEST_FILES = 5;
/** Question-and-answer pairs an intake carries; the oldest fall off as new rounds arrive. */
export const MAX_CLARIFICATIONS = 16;
/** Types whose bytes are also checked for being real UTF-8 text before they are kept. */
export const COACH_TEXT_FILE_TYPES = ["text/plain", "text/markdown", "text/csv"] as const;

const weekday = z.number().int().min(1).max(7);
const optionalText = (max: number) => z.string().trim().max(max).default("");

/**
 * What the athlete answers before the coach writes them a programme.
 *
 * Two routes through it. `guided` is somebody who does not yet have a routine to describe:
 * a goal, anything that hurts, the days they can train, and one box they may write or speak
 * into. `detailed` is somebody who already trains and wants to say exactly what they want.
 * Both end at the same confirmed answers, so nothing downstream has to know which was used.
 *
 * Draft answers may be incomplete. Confirming uses validateIntake, never fabricated defaults.
 */
export const coachIntakeSchema = z.object({
  track: z.enum(["guided", "detailed"]).nullable().default(null),
  goal: optionalText(1500),
  experience: z
    .enum(["beginner", "intermediate", "experienced", "returning", "unknown"])
    .default("unknown"),
  /**
   * What the athlete is lifting now, in their own words — "incline bench 60kg for 8" — rather
   * than a grid of load, unit, convention, machine and date per exercise. Nobody filled that
   * grid in, and the coach recalibrates from logged sets within a session or two anyway.
   */
  recentTraining: optionalText(3000),
  /** Read back from the profile, so nobody is asked twice for what they gave at sign-up. */
  ageYears: z.number().int().min(10).max(100).nullable().default(null),
  weightKg: z.number().min(20).max(500).nullable().default(null),
  heightCm: z.number().min(50).max(260).nullable().default(null),
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
  /**
   * Gym or home, which is as much as anyone is asked. `gymId` is the location that answer
   * resolves to, filled in by the server; it is never a question on screen.
   */
  trainingLocation: z.enum(["gym", "home"]).nullable().default(null),
  gymId: z.uuid().nullable().default(null),
  restrictions: optionalText(3000),
  preferences: optionalText(2000),
  avoidExerciseSlugs: z.array(z.string().min(1).max(120)).max(100).default([]),
  /**
   * The coach's own questions and what the athlete answered.
   *
   * A request that comes back needing more information is answered where it was asked, and
   * the answers travel with the next request as part of the intake — the one thing every job
   * already reads — rather than as a reply to a job that has already finished.
   */
  clarifications: z
    .array(
      z.object({
        question: z.string().trim().min(1).max(700),
        answer: z.string().trim().min(1).max(2000),
      }),
    )
    .max(MAX_CLARIFICATIONS)
    .default([]),
  prompt: optionalText(16000),
  attachmentIds: z.array(z.uuid()).max(MAX_REQUEST_FILES).default([]),
});
export type CoachIntake = z.infer<typeof coachIntakeSchema>;
export type CoachIntakeTrack = NonNullable<CoachIntake["track"]>;
export type TrainingLocation = NonNullable<CoachIntake["trainingLocation"]>;

export function validateIntake(input: unknown): CoachIntake {
  return coachIntakeSchema
    .superRefine((answers, ctx) => {
      const required: [keyof CoachIntake, string][] = [
        ["goal", "Tell the coach your main goal."],
        ["sessionsPerWeek", "Choose how often you can train."],
        ["trainingLocation", "Say whether you train at a gym or at home."],
        ["heightCm", "Add your height."],
        ["weightKg", "Add your weight."],
        ["ageYears", "Add your age."],
        // Only the detailed route asks for a session length; the guided one lets the coach
        // choose it, so requiring it there would block an answer nobody was asked for.
        ...(answers.track === "guided"
          ? []
          : ([["minutesPerSession", "Choose your usual session length."]] as [
              keyof CoachIntake,
              string,
            ][])),
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
  /**
   * Why a review is running. `scheduled` is the ordinary cadence, which reads the whole
   * interval and moves its anchor. `requests` is the daily run answering what the athlete
   * asked for: it reads the same evidence but does not consume the scheduled review, and
   * anything it proposes waits for approval.
   */
  purpose: z.enum(["scheduled", "requests"]).default("scheduled"),
});
export type JobTarget = z.infer<typeof jobTargetSchema>;

/** Opening plans refer to draft positions, not database IDs that do not exist yet. */
export const openingPlanSchema = z.object({
  dayIndex: z.number().int().min(1).max(31),
  gymId: z.uuid(),
  summary: z.string().trim().min(1).max(PLAN_LIMITS.summary),
  sportSummaries: sportSummariesSchema.optional(),
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
  memory: memoryPatchSchema.optional(),
  /** A temporary adaptation may quote any fresh note the athlete wrote themselves. */
  reportedConstraint: sourceQuoteSchema.optional(),
  /** A session-only adaptation expires with this exact occurrence. Evidence must be cited. */
  adjustment: z.enum(["normal", "temporary", "equipment", "calibration"]).default("normal"),
  /**
   * The athlete's explicit asks: the ones this result discovered, and an outcome for every
   * one the job was given. A preference kept in the memo is not an outcome, so this is
   * separate from `memory` and the server refuses a result that leaves an ask unanswered.
   */
  requests: requestPatchSchema.optional(),
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
