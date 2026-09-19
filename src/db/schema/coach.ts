import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
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
import type {
  StoredPlanExercise,
  StoredPlannedOccurrence,
  StoredPlanRun,
} from "../../domain/session-plan";
import { ownerPolicy, timestamps } from "./common";
import {
  coachRequestInitiatorEnum,
  coachRequestStatusEnum,
  planStatusEnum,
  planTriggerEnum,
} from "./enums";
import { activitySportEnum } from "./multisport-enums";
import { gyms } from "./gyms";
import { occurrenceVersions, plannedOccurrences } from "./occurrences";
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
 * The coach's plan for one upcoming session. Exactly one plan is active per target; a newer
 * plan supersedes it, and starting the session consumes it. The session keeps pointing at the
 * plan it used, so history shows what was prescribed on the day.
 *
 * A plan has one of two targets, and the check below holds it to exactly one. A strength
 * preparation names the programme slot and the gym, as it always did. An endurance
 * preparation names one occurrence and the exact prescription revision it was written
 * against — which is what a week and a weekday could never do once two rides can share a
 * Tuesday, and what keeps a preparation from silently becoming the answer to a target that
 * has since changed (plan §8.1, SCHED-02, COACH-08).
 */
export const sessionPlans = pgTable(
  "session_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    /** Null only for a standalone endurance occurrence, which belongs to no programme. */
    programId: uuid("program_id").references(() => programs.id, { onDelete: "cascade" }),
    programDayId: uuid("program_day_id").references(() => programDays.id, { onDelete: "cascade" }),
    cycleIndex: integer("cycle_index"),
    dayIndex: integer("day_index"),
    /**
     * The gym the plan chose machines for; a session at another gym does not use it. Null for
     * endurance, which needs a pool or a road rather than a room full of machines (SCOPE-02).
     */
    gymId: uuid("gym_id").references(() => gyms.id, { onDelete: "restrict" }),
    /** Which sport this preparation is for. Strength, for every plan written before v2. */
    sport: activitySportEnum("sport").notNull().default("strength"),
    /** 1 for the slot-and-gym contract, 2 for the occurrence one. */
    planVersion: integer("plan_version").notNull().default(1),
    /** The exact occurrence and revision an endurance preparation answers for. */
    occurrenceId: uuid("occurrence_id"),
    occurrenceRevisionId: uuid("occurrence_revision_id"),
    /** The prepared endurance sessions, one entry per occurrence this plan covers. */
    endurance: jsonb("endurance")
      .$type<StoredPlannedOccurrence[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
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
      .where(sql`status = 'active' and occurrence_id is null`),
    // One live preparation per occurrence and revision. Two same-day swims are two rows;
    // a second preparation for the same revision is the same preparation (AT-COACH-06).
    uniqueIndex("session_plans_active_occurrence_uq")
      .on(t.userId, t.occurrenceId, t.occurrenceRevisionId)
      .where(sql`status = 'active' and occurrence_id is not null`),
    index("session_plans_user_generated_idx").on(t.userId, t.generatedAt.desc()),
    index("session_plans_session_idx").on(t.workoutSessionId),
    index("session_plans_occurrence_idx").on(t.userId, t.occurrenceId),
    // Owner and sport travel in the key, so a plan cannot claim a target belonging to another
    // account or name a swim as though it were a ride (AT-DATA-02).
    foreignKey({
      name: "session_plans_occurrence_fk",
      columns: [t.userId, t.occurrenceId, t.sport],
      foreignColumns: [plannedOccurrences.userId, plannedOccurrences.id, plannedOccurrences.sport],
    }).onDelete("cascade"),
    // And the revision has to belong to the occurrence it claims to be a revision of.
    foreignKey({
      name: "session_plans_occurrence_revision_fk",
      columns: [t.userId, t.occurrenceId, t.occurrenceRevisionId, t.sport],
      foreignColumns: [
        occurrenceVersions.userId,
        occurrenceVersions.occurrenceId,
        occurrenceVersions.id,
        occurrenceVersions.sport,
      ],
    }).onDelete("cascade"),
    check("session_plans_indexes_chk", sql`cycle_index >= 1 and day_index >= 1`),
    // Exactly one kind of target. A strength plan names its slot, its day and its gym; an
    // endurance plan names its occurrence and the revision it was written against.
    check(
      "session_plans_target_chk",
      sql`(occurrence_id is null and program_id is not null and program_day_id is not null
            and cycle_index is not null and day_index is not null and gym_id is not null
            and sport = 'strength')
          or (occurrence_id is not null and occurrence_revision_id is not null
            and sport <> 'strength')`,
    ),
    ownerPolicy("session_plans"),
  ],
).enableRLS();
