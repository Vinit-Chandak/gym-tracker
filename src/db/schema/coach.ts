import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type { PlanWarning } from "../../domain/coach-review";
import type { MemoryItem, NoteDisposition } from "../../domain/coach-memory";
import type { StoredPlanExercise, StoredPlanRun } from "../../domain/session-plan";
import { ownerPolicy, timestamps } from "./common";
import {
  coachRequestInitiatorEnum,
  coachRequestStatusEnum,
  planStatusEnum,
  planTriggerEnum,
} from "./enums";
import { gyms } from "./gyms";
import { profiles } from "./profiles";
import { coachProgramRequests } from "./coaching-workflow";
import { programDays, programs } from "./programs";
import { workoutSessions } from "./workouts";

/** Only a hash is stored. Tokens grant read-only access through /api/coach. */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("api_tokens_hash_uq").on(t.tokenHash),
    index("api_tokens_user_idx").on(t.userId),
    ownerPolicy("api_tokens"),
  ],
).enableRLS();

/**
 * Coach-maintained memory with attributable athlete reports and source-backed observations.
 * Overview remains for compatibility; user_notes is the athlete's independent channel.
 */
export const coachMemos = pgTable(
  "coach_memos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    overview: text("overview").notNull().default(""),
    items: jsonb("items")
      .$type<MemoryItem[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    memoryRevision: integer("memory_revision").notNull().default(0),
    userNotes: text("user_notes").notNull().default(""),
    overviewUpdatedAt: timestamp("overview_updated_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("coach_memos_user_uq").on(t.userId), ownerPolicy("coach_memos")],
).enableRLS();

/** Append-only athlete messages. Saving another note never erases an unread one. */
export const coachNotes = pgTable(
  "coach_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** What became of the note: remembered, applied, queued for review, or no action. */
    disposition: text("disposition").$type<NoteDisposition>(),
    /** One line saying why, required of the dispositions that leave the athlete waiting. */
    dispositionDetail: text("disposition_detail").notNull().default(""),
    /**
     * The open request this note answers, when the athlete wrote it from a coach question.
     * The note still reaches the coach as an ordinary message; this says which question it
     * closes, so the answer resumes that request instead of starting another one.
     */
    requestId: uuid("request_id").references(() => coachProgramRequests.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("coach_notes_user_created_idx").on(t.userId, t.createdAt),
    ownerPolicy("coach_notes"),
  ],
).enableRLS();

/**
 * The coach's read receipt for a note written during training.
 *
 * Notes on a finished session and on a single exercise are athlete messages too, but they
 * live on rows the athlete's log owns, which a coaching read must never write to. The receipt
 * is kept beside them instead, so a training note can be pending, then closed with the same
 * outcome as any other note, and is never quietly lost when it ages out of the read window.
 */
export const coachNoteReviews = pgTable(
  "coach_note_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    /** `workout:<uuid>` or `exercise:<uuid>`; Tell the coach notes carry their own column. */
    sourceId: text("source_id").notNull(),
    disposition: text("disposition").$type<NoteDisposition>().notNull(),
    detail: text("detail").notNull().default(""),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("coach_note_reviews_user_source_uq").on(t.userId, t.sourceId),
    ownerPolicy("coach_note_reviews"),
  ],
).enableRLS();

/**
 * A re-plan the athlete asked for from Today. The app fires the coach routine and remembers
 * the run it started; the coach reports back by storing a plan or marking the request failed.
 */
export const coachRequests = pgTable(
  "coach_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    gymId: uuid("gym_id").references(() => gyms.id, { onDelete: "set null" }),
    /** Which kind of planning this was, so a failed nightly run is visible beside a re-plan. */
    trigger: planTriggerEnum("trigger").notNull().default("replan"),
    /**
     * Who started it. The athlete's daily allowance counts only their own asks, so the coach's
     * own runs and records never spend a request the athlete could have used.
     */
    initiatedBy: coachRequestInitiatorEnum("initiated_by").notNull().default("coach"),
    status: coachRequestStatusEnum("status").notNull().default("requested"),
    reason: text("reason"),
    routineSessionId: text("routine_session_id"),
    routineSessionUrl: text("routine_session_url"),
    error: text("error"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("coach_requests_user_requested_idx").on(t.userId, t.requestedAt.desc()),
    ownerPolicy("coach_requests"),
  ],
).enableRLS();

/**
 * The coach's plan for one upcoming programme slot at one gym. Exactly one plan is active per
 * slot; a newer plan supersedes it, and starting the session consumes it. The session keeps
 * pointing at the plan it used, so history shows what was prescribed on the day.
 */
export const sessionPlans = pgTable(
  "session_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    programDayId: uuid("program_day_id")
      .notNull()
      .references(() => programDays.id, { onDelete: "cascade" }),
    cycleIndex: integer("cycle_index").notNull(),
    dayIndex: integer("day_index").notNull(),
    /** The gym the plan chose machines for; a session at another gym does not use it. */
    gymId: uuid("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "restrict" }),
    status: planStatusEnum("status").notNull().default("active"),
    trigger: planTriggerEnum("trigger").notNull(),
    requestId: uuid("request_id").references(() => coachRequests.id, { onDelete: "set null" }),
    summary: text("summary").notNull(),
    sportSummaries: jsonb("sport_summaries")
      .$type<{ workout?: string; run?: string }>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    warmup: jsonb("warmup")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    exercises: jsonb("exercises").$type<StoredPlanExercise[]>().notNull(),
    /** The run the coach planned for this slot, on a day that runs. */
    run: jsonb("run").$type<StoredPlanRun>(),
    /**
     * What the app noticed about the plan when it was stored: a large jump, volume well away
     * from the programme, an RIR under the floor. Advice only; nothing here blocked the plan.
     */
    warnings: jsonb("warnings")
      .$type<PlanWarning[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    model: text("model"),
    routineSessionUrl: text("routine_session_url"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    workoutSessionId: uuid("workout_session_id").references(() => workoutSessions.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("session_plans_active_slot_uq")
      .on(t.programId, t.cycleIndex, t.dayIndex)
      .where(sql`status = 'active'`),
    index("session_plans_user_generated_idx").on(t.userId, t.generatedAt.desc()),
    index("session_plans_session_idx").on(t.workoutSessionId),
    check("session_plans_indexes_chk", sql`cycle_index >= 1 and day_index >= 1`),
    ownerPolicy("session_plans"),
  ],
).enableRLS();
