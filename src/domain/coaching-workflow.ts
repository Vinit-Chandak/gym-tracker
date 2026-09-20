import { z } from "zod";
import { ACTIVITY_SPORTS, ENDURANCE_SPORTS } from "./activity";
import { endurancePrescriptionSchema } from "./activity-prescription";
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

export const COACH_CONTRACT_VERSION = 5;

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
/**
 * Contract versions this server still accepts from a worker.
 *
 * One, for now. v4 has no `headline` on a programme result, and the field is required rather
 * than optional precisely so a change screen always has a line to open with; accepting v4
 * beside it would mean drafts that silently have none. A worker on a stale clone is turned
 * away before it claims, rather than after it has computed a whole programme. The list
 * exists rather than a bare equality because a future additive version may be accepted
 * alongside this one, and the negotiation should then be a data change rather than a code
 * change (plan §8.5).
 */
export const SUPPORTED_CONTRACT_VERSIONS: readonly number[] = [COACH_CONTRACT_VERSION];

export function isSupportedContract(version: number): boolean {
  return SUPPORTED_CONTRACT_VERSIONS.includes(version);
}

export function contractSkew(served: number): string | null {
  if (served === COACH_CONTRACT_VERSION) return null;
  const stale = served > COACH_CONTRACT_VERSION;
  return (
    `Contract version ${served} from the coach service, ${COACH_CONTRACT_VERSION} in this checkout. ` +
    (stale
      ? "This routine is running a stale clone, so its skill describes fields the server no longer accepts. " +
        "Refresh it with `git fetch origin main && git merge --ff-only origin/main` and run again; " +
        "if that does not fast-forward, report what git said rather than forcing it."
      : "This checkout is ahead of the deployed app. Wait for the deployment to finish.") +
    " Stop and report the skew; do not guess at field names."
  );
}
export const COACH_POLICY_VERSION = "2026-09-20.1";
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
 * Intake version 2 (plan §8.1).
 *
 * Version 1 asked about lifting, and asked about running as an afterthought bolted to it.
 * Neither shape fits somebody who only swims. So the sport-specific answers move into a list
 * with one entry per sport the athlete actually confirmed, and the v1 fields stay exactly
 * where they were: an intake saved last year still parses, and its running answers still
 * mean what they meant (MIG-02).
 *
 * The list is consent, not a menu. A sport appears here because the athlete confirmed it; the
 * coach may suggest one, and suggesting is not including (COACH-01).
 */
export const INTAKE_VERSION = 2;

export const sportIntakeSchema = z.object({
  sport: z.enum(ACTIVITY_SPORTS),
  experience: z
    .enum(["beginner", "intermediate", "experienced", "returning", "unknown"])
    .default("unknown"),
  /** Sessions a week in this sport. Null leaves the choice to the coach, as v1 did. */
  sessionsPerWeek: z.number().int().min(0).max(14).nullable().default(null),
  preferredDays: z
    .array(weekday)
    .max(7)
    .default([])
    .refine((days) => new Set(days).size === days.length, "Choose each weekday once."),
  minutesPerSession: z.number().int().min(5).max(600).nullable().default(null),
  /** Where they can do it: a pool, a turbo trainer, a park. Their words, not a taxonomy. */
  access: optionalText(600),
  /** Anything they want the coach to know about this sport specifically. */
  notes: optionalText(1000),
});
export type SportIntake = z.infer<typeof sportIntakeSchema>;

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
  /**
   * The sports this programme is for, each with its own answers (SCOPE-02, ONBOARD-02).
   *
   * Empty means a v1 intake, which is read exactly as it always was: lifting, plus running
   * where `runsPerWeek` says so. Nothing is inferred into this list from those fields, because
   * an inferred sport is a sport nobody confirmed.
   */
  sports: z
    .array(sportIntakeSchema)
    .max(ACTIVITY_SPORTS.length)
    .default([])
    .refine(
      (entries) => new Set(entries.map((entry) => entry.sport)).size === entries.length,
      "Answer for each sport once.",
    ),
  /** Total minutes a week across every sport, when the athlete gave one. */
  weeklyMinutes: z.number().int().min(10).max(5000).nullable().default(null),
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
  /**
   * The gym, where one is needed. A swim needs a pool, not a gym, and requiring one would
   * have meant inventing a dummy location for an athlete who never lifts (SCOPE-02).
   */
  gymId: z.uuid().nullable().default(null),
  /**
   * The exact occurrence this preparation is for, and the revision it was written against.
   *
   * A day and a weekday cannot name a session once two rides can share a Tuesday, so an
   * endurance preparation names an identity instead. The revision travels with it: a job
   * queued against one prescription may not be answered against a newer one (SCHED-02,
   * COACH-08).
   */
  occurrenceId: z.uuid().nullable().default(null),
  occurrenceRevisionId: z.uuid().nullable().default(null),
  sport: z.enum(ACTIVITY_SPORTS).nullable().default(null),
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

/**
 * An endurance session in an opening plan, before any of it exists in the database.
 *
 * A draft's occurrences have local ids — `run-1-3-0` — and only become real UUIDs in the
 * activation transaction. A plan written for one therefore points at the local id, and the
 * activation resolves it; nothing here may name a UUID, because there is nothing to name yet
 * (plan §8.2 item 2).
 */
export const openingOccurrencePlanSchema = z.object({
  localOccurrenceId: z.string().min(1).max(64),
  sport: z.enum(ENDURANCE_SPORTS),
  summary: z.string().trim().min(1).max(PLAN_LIMITS.summary),
  prescription: endurancePrescriptionSchema.nullable().default(null),
  note: z.string().trim().max(PLAN_LIMITS.note).default(""),
});
export type OpeningOccurrencePlan = z.infer<typeof openingOccurrencePlanSchema>;

/** Opening plans refer to draft positions, not database IDs that do not exist yet. */
export const openingPlanSchema = z
  .object({
    /** The strength day this opens on. Null for a programme with no lifting in it at all. */
    dayIndex: z.number().int().min(1).max(31).nullable().default(null),
    /** A strength opening plan needs a gym; an endurance-only one does not (SCOPE-02). */
    gymId: z.uuid().nullable().default(null),
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
    /**
     * The endurance work in the opening week, one entry per draft occurrence. A programme with
     * no lifting at all has only these, which is the point: a swimmer's first week is a real
     * opening plan and not an empty one (SCOPE-02).
     */
    occurrences: z
      .array(openingOccurrencePlanSchema)
      .max(PLAN_LIMITS.enduranceOccurrences)
      .default([])
      .refine(
        (entries) =>
          new Set(entries.map((entry) => entry.localOccurrenceId)).size === entries.length,
        "Plan each occurrence once.",
      ),
  })
  .superRefine((plan, ctx) => {
    // Lifting still needs somewhere with machines in it, and a day of the cycle to be on.
    // Nothing about that changed; what changed is that a plan without lifting no longer has
    // to invent them (SCOPE-02).
    if (plan.exercises.length > 0 || plan.run !== null) {
      if (plan.dayIndex === null)
        ctx.addIssue({
          code: "custom",
          message: "Say which day of the cycle this opening session is.",
          path: ["dayIndex"],
        });
      if (plan.exercises.length > 0 && plan.gymId === null)
        ctx.addIssue({
          code: "custom",
          message: "An opening session with exercises needs the gym its machines are at.",
          path: ["gymId"],
        });
    }
  });
export type OpeningPlan = z.infer<typeof openingPlanSchema>;

/**
 * What a programme review says about one sport (plan §8.2 item 7).
 *
 * Every included sport gets one of these, whether or not anything changed and whether or not
 * there was much to read. Sparse evidence produces a hold with a reason; it never produces
 * silence, because a sport missing from the list is indistinguishable from a sport the review
 * forgot about (COACH-02).
 */
export const sportCoverageSchema = z.object({
  sport: z.enum(ACTIVITY_SPORTS),
  decision: z.enum(["changed", "unchanged", "hold", "question"]),
  reason: z.string().trim().max(1000).default(""),
  sourceIds: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  /** Whether the actuals read could honestly be compared with one another (§9.1). */
  comparable: z.boolean().default(false),
});
export type SportCoverageEntry = z.infer<typeof sportCoverageSchema>;

/** One sentence, not a paragraph: long enough to be specific, too short to reason in. */
export const HEADLINE_LIMIT = 140;

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
  /** One entry per included sport, on a programme review. Checked, not taken on trust. */
  coverage: z.array(sportCoverageSchema).max(ACTIVITY_SPORTS.length).default([]),
};
export const coachJobResultSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("program"),
    blueprint: programBlueprintSchema,
    openingPlan: openingPlanSchema.nullable().default(null),
    /**
     * What this change does, in one sentence the athlete would say themselves.
     *
     * The screen shows this and folds `rationale` away behind it. Without it the app had
     * only the long explanation to print, so every change screen opened with several
     * paragraphs of reasoning above the six lines that had actually changed. Short is the
     * point: "Doubles your direct core work: 4 → 8 sets a week, on 4 days instead of 2."
     */
    headline: z.string().trim().min(1).max(HEADLINE_LIMIT),
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
