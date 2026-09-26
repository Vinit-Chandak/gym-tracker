import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { MAX_JOB_ATTEMPTS } from "../../domain/coaching-workflow";
import type {
  CoachIntake,
  CoachJobResult,
  JobTarget,
  OpeningPlan,
} from "../../domain/coaching-workflow";
import type { ProgramBlueprint } from "../../domain/program-blueprint";
import type { RequestState } from "../../domain/program-request";
import type { SavedRoutineDay } from "../../domain/saved-routine";
import { ownerPolicy, timestamps } from "./common";
import { profiles } from "./profiles";
import { programs } from "./programs";

const owner = () =>
  uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" });
const instant = (name: string) => timestamp(name, { withTimezone: true });

export const coachSourceRevisions = pgTable(
  "coach_source_revisions",
  {
    userId: owner().primaryKey(),
    revision: bigint("revision", { mode: "number" }).notNull().default(1),
  },
  () => [ownerPolicy("coach_source_revisions")],
).enableRLS();

export const coachIntakes = pgTable(
  "coach_intakes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    revision: integer("revision").notNull(),
    answers: jsonb("answers").$type<CoachIntake>().notNull(),
    confirmedAt: instant("confirmed_at"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("coach_intakes_user_revision_uq").on(t.userId, t.revision),
    ownerPolicy("coach_intakes"),
  ],
).enableRLS();

export const coachPreferences = pgTable(
  "coach_preferences",
  {
    userId: owner().primaryKey(),
    mode: text("mode").$type<"coach" | "manual" | "track">().notNull().default("track"),
    intakeId: uuid("intake_id").references(() => coachIntakes.id, { onDelete: "set null" }),
    reviewWeekday: integer("review_weekday"),
    reviewAnchorAt: instant("review_anchor_at"),
    /**
     * When the athlete last asked for something only a programme review can grant. A request
     * left sitting for up to ten days looked exactly like being ignored, so it brings the
     * review forward to the next nightly run; the answer is still a proposal the athlete
     * approves. Cleared by the review it asked for.
     */
    reviewRequestedAt: instant("review_requested_at"),
    consentedAt: instant("consented_at"),
    ...timestamps,
  },
  (t) => [
    check("coach_preferences_mode_chk", sql`${t.mode} in ('coach','manual','track')`),
    check(
      "coach_preferences_weekday_chk",
      sql`${t.reviewWeekday} is null or ${t.reviewWeekday} between 1 and 7`,
    ),
    ownerPolicy("coach_preferences"),
  ],
).enableRLS();

/** Small private files are streamed through authenticated routes; never public URLs. */
export const coachAttachments = pgTable(
  "coach_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    name: text("name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    content: text("content").notNull(),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("coach_attachments_user_idx").on(t.userId),
    check("coach_attachments_size_chk", sql`${t.size} > 0 and ${t.size} <= 3145728`),
    ownerPolicy("coach_attachments"),
  ],
).enableRLS();

export const coachJobs = pgTable(
  "coach_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    kind: text("kind").$type<"create_program" | "prepare_session" | "review_program">().notNull(),
    trigger: text("trigger")
      .$type<"onboarding" | "replacement" | "daily" | "weekly" | "gym">()
      .notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    status: text("status")
      .$type<"queued" | "claimed" | "succeeded" | "needs_input" | "failed" | "superseded">()
      .notNull()
      .default("queued"),
    intakeId: uuid("intake_id").references(() => coachIntakes.id, { onDelete: "set null" }),
    target: jsonb("target").$type<JobTarget>().notNull(),
    sourceRevision: bigint("source_revision", { mode: "number" }),
    attemptId: uuid("attempt_id"),
    attempts: integer("attempts").notNull().default(0),
    /**
     * How many attempts this job may spend before it is failed for good.
     *
     * `attempts` only ever counts up, because the receipt trigger writes one
     * `coach_job_attempts` row per `(job_id, attempts)` and that pair is unique. So a job sent
     * back for another try cannot have its counter reset — it is given a bigger budget instead,
     * which keeps every receipt it has already earned and says plainly that it was retried.
     */
    attemptBudget: integer("attempt_budget").notNull().default(MAX_JOB_ATTEMPTS),
    leaseUntil: instant("lease_until"),
    nextAttemptAt: instant("next_attempt_at").notNull().defaultNow(),
    dispatchStartedAt: instant("dispatch_started_at"),
    routineSessionId: text("routine_session_id"),
    routineSessionUrl: text("routine_session_url"),
    result: jsonb("result").$type<CoachJobResult>(),
    resultDigest: text("result_digest"),
    error: text("error"),
    completedAt: instant("completed_at"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("coach_jobs_dedupe_uq").on(t.userId, t.dedupeKey),
    index("coach_jobs_claim_idx").on(t.status, t.nextAttemptAt),
    index("coach_jobs_user_created_idx").on(t.userId, t.createdAt.desc()),
    check(
      "coach_jobs_status_chk",
      sql`${t.status} in ('queued','claimed','succeeded','needs_input','failed','superseded')`,
    ),
    check(
      "coach_jobs_kind_chk",
      sql`${t.kind} in ('create_program','prepare_session','review_program')`,
    ),
    ownerPolicy("coach_jobs"),
  ],
).enableRLS();

export const programDrafts = pgTable(
  "program_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    source: text("source").$type<"manual" | "ai" | "weekly">().notNull(),
    status: text("status")
      .$type<"editing" | "ready" | "activated" | "rejected" | "superseded">()
      .notNull()
      .default("editing"),
    blueprint: jsonb("blueprint").$type<ProgramBlueprint>().notNull(),
    openingPlan: jsonb("opening_plan").$type<OpeningPlan>(),
    jobId: uuid("job_id").references(() => coachJobs.id, { onDelete: "set null" }),
    intakeId: uuid("intake_id").references(() => coachIntakes.id, { onDelete: "set null" }),
    baseProgramId: uuid("base_program_id").references(() => programs.id, { onDelete: "set null" }),
    sourceRevision: bigint("source_revision", { mode: "number" }).notNull(),
    revision: integer("revision").notNull().default(1),
    /** One line saying what this change does, in the athlete's terms. Shown; never truncated. */
    headline: text("headline").notNull().default(""),
    rationale: text("rationale").notNull().default(""),
    uncertainties: jsonb("uncertainties")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /**
     * Why the server would not apply this on its own, in its own words.
     *
     * Kept apart from `uncertainties`, which is the coach's. These are guardrail findings —
     * "a new slot needs review", once per slot — and printing them beside a coach's caveat
     * told the athlete that the coach was unsure about something the policy simply gates.
     */
    gateReasons: jsonb("gate_reasons")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    activatedProgramId: uuid("activated_program_id").references(() => programs.id, {
      onDelete: "set null",
    }),
    /**
     * How a draft stopped being open, when it was not by being started.
     *
     * `rejected` alone could not tell the coach whether the athlete said no — which it must
     * not propose again for a while — or asked for the same change reworked, which it must.
     * `replaced` is a proposal a newer review built on and took the place of.
     */
    closedAs: text("closed_as").$type<
      "declined" | "revised" | "discarded" | "replaced" | "outdated"
    >(),
    closedAt: instant("closed_at"),
    /** What the athlete wrote when they asked for revisions, read beside the draft it revises. */
    revisionNoteId: uuid("revision_note_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("program_drafts_job_uq").on(t.jobId),
    index("program_drafts_user_idx").on(t.userId, t.createdAt.desc()),
    ownerPolicy("program_drafts"),
  ],
).enableRLS();

/** Every lease keeps its own receipt, including attempts that time out or are superseded. */
export const coachJobAttempts = pgTable(
  "coach_job_attempts",
  {
    id: uuid("id").primaryKey(),
    userId: owner(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => coachJobs.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    status: text("status").notNull(),
    sourceRevision: bigint("source_revision", { mode: "number" }).notNull(),
    startedAt: instant("started_at").notNull(),
    leaseUntil: instant("lease_until").notNull(),
    finishedAt: instant("finished_at"),
    resultDigest: text("result_digest"),
    error: text("error"),
  },
  (t) => [
    uniqueIndex("coach_job_attempts_number_uq").on(t.jobId, t.number),
    ownerPolicy("coach_job_attempts"),
  ],
).enableRLS();

export const coachWeeklyReviews = pgTable(
  "coach_weekly_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => coachJobs.id, { onDelete: "cascade" }),
    periodStart: instant("period_start").notNull(),
    periodEnd: instant("period_end").notNull(),
    outcome: text("outcome").$type<"no_change" | "automatic" | "proposal">().notNull(),
    rationale: text("rationale").notNull(),
    draftId: uuid("draft_id").references(() => programDrafts.id, { onDelete: "set null" }),
    completedAt: instant("completed_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("coach_weekly_reviews_period_uq").on(t.userId, t.periodEnd),
    ownerPolicy("coach_weekly_reviews"),
  ],
).enableRLS();

export const coachGymIntents = pgTable(
  "coach_gym_intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    cycleIndex: integer("cycle_index").notNull(),
    dayIndex: integer("day_index").notNull(),
    gymId: uuid("gym_id").notNull(),
    requestedOn: date("requested_on").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("coach_gym_intents_occurrence_uq").on(
      t.userId,
      t.programId,
      t.cycleIndex,
      t.dayIndex,
    ),
    ownerPolicy("coach_gym_intents"),
  ],
).enableRLS();

export const savedRoutines = pgTable(
  "saved_routines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    name: text("name").notNull(),
    day: jsonb("day").$type<SavedRoutineDay>().notNull(),
    ...timestamps,
  },
  (t) => [index("saved_routines_user_idx").on(t.userId), ownerPolicy("saved_routines")],
).enableRLS();

/**
 * One thing the athlete asked the programme to do, kept until it has an outcome.
 *
 * The note it came from is a message and can hold more than one ask; a single read receipt
 * on that message could not say that the curls were proposed and the core work still needs a
 * question answered. Each ask is its own row, anchored to the athlete's exact words, and it
 * survives the review that could not grant it — a preference remembered in the memo is not an
 * answer, and neither is a note marked reviewed.
 */
export const coachProgramRequests = pgTable(
  "coach_program_requests",
  {
    /** Minted by the coaching run, so its own result can decide a request it just opened. */
    id: uuid("id").primaryKey(),
    userId: owner(),
    /** `note:<uuid>`, `workout:<uuid>` or `exercise:<uuid>` — the athlete's own words. */
    sourceId: text("source_id").notNull(),
    quote: text("quote").notNull(),
    summary: text("summary").notNull(),
    state: text("state").$type<RequestState>().notNull().default("waiting"),
    /** The question, the reason, or where the programme already covers it. */
    detail: text("detail").notNull().default(""),
    /** What has to be true for a deferral to be reconsidered, beside its date. */
    condition: text("condition").notNull().default(""),
    reconsiderAfter: date("reconsider_after"),
    openedJobId: uuid("opened_job_id").references(() => coachJobs.id, { onDelete: "set null" }),
    decidedJobId: uuid("decided_job_id").references(() => coachJobs.id, { onDelete: "set null" }),
    draftId: uuid("draft_id").references(() => programDrafts.id, { onDelete: "set null" }),
    /** Diff operation IDs the accepted decision named, so a claim can be checked later. */
    changeRefs: jsonb("change_refs")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /**
     * The attempt whose input snapshot carried this request. A request saved after that
     * snapshot is not the claimed run's to close, and waits for the next daily run.
     */
    claimedJobId: uuid("claimed_job_id").references(() => coachJobs.id, { onDelete: "set null" }),
    claimedAttemptId: uuid("claimed_attempt_id"),
    resolvedAt: instant("resolved_at"),
    ...timestamps,
  },
  (t) => [
    index("coach_program_requests_user_state_idx").on(t.userId, t.state, t.createdAt),
    index("coach_program_requests_source_idx").on(t.userId, t.sourceId),
    ownerPolicy("coach_program_requests"),
  ],
).enableRLS();

/** Every outcome a request has had, so a decision is never quietly rewritten. */
export const coachRequestDecisions = pgTable(
  "coach_request_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => coachProgramRequests.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => coachJobs.id, { onDelete: "set null" }),
    state: text("state").$type<RequestState>().notNull(),
    detail: text("detail").notNull().default(""),
    changeRefs: jsonb("change_refs")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    decidedAt: instant("decided_at").notNull().defaultNow(),
  },
  (t) => [
    index("coach_request_decisions_request_idx").on(t.userId, t.requestId, t.decidedAt),
    ownerPolicy("coach_request_decisions"),
  ],
).enableRLS();

/**
 * A small receipt for one finished coaching attempt, kept for thirty days.
 *
 * Enough to answer "which guidance did that run read, and what did the server say about its
 * result" when something looks wrong, and nothing more: no prompts, no histories, no hidden
 * reasoning. It is never shown in the app and never sent back to the model, and it expires on
 * its own so debugging material does not become a second copy of the athlete's training.
 */
export const coachAttemptDiagnostics = pgTable(
  "coach_attempt_diagnostics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    jobId: uuid("job_id").references(() => coachJobs.id, { onDelete: "cascade" }),
    attemptId: uuid("attempt_id"),
    kind: text("kind").notNull(),
    outcome: text("outcome").notNull(),
    /** The training reference and result contract the run was served. */
    referenceVersion: text("reference_version").notNull(),
    contractVersion: integer("contract_version").notNull(),
    /** Counts and flags only — never prose the athlete wrote or the model produced. */
    diagnostics: jsonb("diagnostics")
      .$type<Record<string, number | string | boolean>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    error: text("error"),
    completedAt: instant("completed_at").notNull().defaultNow(),
    /** Deleted on or after this instant by the daily cleanup, whatever else happened. */
    expiresAt: instant("expires_at").notNull(),
  },
  (t) => [
    index("coach_attempt_diagnostics_expiry_idx").on(t.expiresAt),
    index("coach_attempt_diagnostics_user_idx").on(t.userId, t.completedAt),
    ownerPolicy("coach_attempt_diagnostics"),
  ],
).enableRLS();
