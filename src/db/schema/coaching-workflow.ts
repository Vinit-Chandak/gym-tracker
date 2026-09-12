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
import type {
  CoachIntake,
  CoachJobResult,
  JobTarget,
  OpeningPlan,
} from "../../domain/coaching-workflow";
import type { ProgramBlueprint } from "../../domain/program-blueprint";
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
    rationale: text("rationale").notNull().default(""),
    uncertainties: jsonb("uncertainties")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    activatedProgramId: uuid("activated_program_id").references(() => programs.id, {
      onDelete: "set null",
    }),
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
