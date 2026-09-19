import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { EndurancePrescription } from "../../domain/activity-prescription";
import { activities } from "./activities";
import { activityTemplateRevisions } from "./activity-templates";
import { serverWritePolicies, timestamps } from "./common";
import {
  activitySportEnum,
  occurrenceDispositionEnum,
  occurrenceEventKindEnum,
} from "./multisport-enums";
import { profiles } from "./profiles";
import { programDays, programs } from "./programs";

/**
 * A programme family as a row, so ownership can be enforced (plan §6.3).
 *
 * `programs.family_id` has always been the lineage across versions, but with nothing to point
 * at, a composite owner key could not include it. This registry is that anchor and nothing
 * more: there is no second active-programme model here.
 */
export const programFamilies = pgTable(
  "program_families",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("program_families_owner_id_uq").on(t.userId, t.id),
    ...serverWritePolicies("program_families"),
  ],
).enableRLS();

/**
 * One intended performance, with an identity of its own.
 *
 * Two runs on one Wednesday are two rows. Moving one moves one. A programme revision attaches
 * a new immutable prescription version to the same row, so history logged against the old one
 * still says what was actually prescribed on the day (§7).
 */
export const plannedOccurrences = pgTable(
  "planned_occurrences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    sport: activitySportEnum("sport").notNull(),
    /** Null for standalone work, which belongs to no programme (SCHED-08). */
    familyId: uuid("family_id"),
    /** The training role this performs, stable across programme versions. */
    slotLineageId: uuid("slot_lineage_id"),
    cycleIndex: integer("cycle_index"),
    disposition: occurrenceDispositionEnum("disposition").notNull().default("pending"),
    /** The revision in force. Set after the first version row exists, in the same transaction. */
    currentRevisionId: uuid("current_revision_id"),
    /** Adherence keeps counting against where it was first placed, however often it moves. */
    originalWeekIndex: integer("original_week_index"),
    originalScheduledOn: date("original_scheduled_on"),
    /** Where a migrated occurrence came from, e.g. `program_runs:<id>`. */
    legacySource: text("legacy_source"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("planned_occurrences_owner_id_uq").on(t.userId, t.id),
    uniqueIndex("planned_occurrences_owner_id_sport_uq").on(t.userId, t.id, t.sport),
    uniqueIndex("planned_occurrences_legacy_source_uq")
      .on(t.userId, t.legacySource)
      .where(sql`legacy_source is not null`),
    index("planned_occurrences_programme_idx").on(
      t.userId,
      t.familyId,
      t.slotLineageId,
      t.cycleIndex,
    ),
    foreignKey({
      name: "planned_occurrences_family_fk",
      columns: [t.userId, t.familyId],
      foreignColumns: [programFamilies.userId, programFamilies.id],
    }).onDelete("cascade"),
    check(
      "planned_occurrences_programme_chk",
      sql`(family_id is not null) or (slot_lineage_id is null and cycle_index is null
            and original_week_index is null)`,
    ),
    ...serverWritePolicies("planned_occurrences"),
  ],
).enableRLS();

/**
 * What an occurrence asks for, as it stood at one moment. Rows here are never edited: a change
 * writes a new version and repoints the occurrence, so a logged activity can keep naming the
 * exact revision that was on screen when it was written.
 */
export const occurrenceVersions = pgTable(
  "occurrence_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    occurrenceId: uuid("occurrence_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    sport: activitySportEnum("sport").notNull(),
    /** The approving programme version, or null for standalone work. */
    programVersionId: uuid("program_version_id"),
    /** The strength day this stands for, where the occurrence is a strength one. */
    programDayId: uuid("program_day_id"),
    scheduledOn: date("scheduled_on").notNull(),
    schedulingZone: text("scheduling_zone").notNull(),
    /** Optional. A time orders the day's cards; it implies no live recording. */
    scheduledLocalTime: time("scheduled_local_time"),
    orderIndex: integer("order_index").notNull().default(0),
    prescriptionVersion: integer("prescription_version").notNull().default(1),
    prescription: jsonb("prescription").$type<EndurancePrescription | null>(),
    templateRevisionId: uuid("template_revision_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("occurrence_versions_key_uq").on(t.userId, t.occurrenceId, t.id, t.sport),
    index("occurrence_versions_schedule_idx").on(t.userId, t.scheduledOn, t.orderIndex),
    foreignKey({
      name: "occurrence_versions_occurrence_fk",
      columns: [t.userId, t.occurrenceId, t.sport],
      foreignColumns: [plannedOccurrences.userId, plannedOccurrences.id, plannedOccurrences.sport],
    }).onDelete("cascade"),
    foreignKey({
      name: "occurrence_versions_program_fk",
      columns: [t.userId, t.programVersionId],
      foreignColumns: [programs.userId, programs.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "occurrence_versions_program_day_fk",
      columns: [t.userId, t.programDayId],
      foreignColumns: [programDays.userId, programDays.id],
    }).onDelete("set null"),
    foreignKey({
      name: "occurrence_versions_template_fk",
      columns: [t.userId, t.templateRevisionId],
      foreignColumns: [activityTemplateRevisions.userId, activityTemplateRevisions.id],
    }).onDelete("set null"),
    check("occurrence_versions_order_chk", sql`order_index >= 0`),
    ...serverWritePolicies("occurrence_versions"),
  ],
).enableRLS();

/**
 * Append-only history for an occurrence: what happened to it, when, and who said so.
 *
 * It records; it does not decide. A logged resolution is the unique linked activity, and no
 * event may conjure one — which is exactly how a migrated completion with no raw run stays a
 * legacy resolution instead of becoming an activity nobody performed (§6.3).
 */
export const occurrenceEvents = pgTable(
  "occurrence_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    occurrenceId: uuid("occurrence_id").notNull(),
    kind: occurrenceEventKindEnum("kind").notNull(),
    activityId: uuid("activity_id"),
    occurredOn: date("occurred_on"),
    /** athlete, coach, migration or system. Never a free-text note. */
    actor: text("actor").notNull().default("athlete"),
    source: text("source"),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("occurrence_events_occurrence_idx").on(t.userId, t.occurrenceId, t.createdAt),
    foreignKey({
      name: "occurrence_events_occurrence_fk",
      columns: [t.userId, t.occurrenceId],
      foreignColumns: [plannedOccurrences.userId, plannedOccurrences.id],
    }).onDelete("cascade"),
    // Deleting an activity clears the pointer and keeps the event: what happened to an
    // occurrence is history, and history does not disappear with the record it described.
    // The migration writes `on delete set null (activity_id)` so the owner is not nulled too.
    foreignKey({
      name: "occurrence_events_activity_fk",
      columns: [t.userId, t.activityId],
      foreignColumns: [activities.userId, activities.id],
    }).onDelete("set null"),
    check("occurrence_events_actor_chk", sql`actor in ('athlete', 'coach', 'migration', 'system')`),
    ...serverWritePolicies("occurrence_events"),
  ],
).enableRLS();

/**
 * A short lease on a planned log, taken when the form opens. It pins the revision the athlete
 * is reading so a coach acceptance cannot change the target underneath them, and it expires
 * on its own so a lost browser cannot freeze the programme (§5.3).
 */
export const occurrenceEditClaims = pgTable(
  "occurrence_edit_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    occurrenceId: uuid("occurrence_id").notNull(),
    pinnedRevisionId: uuid("pinned_revision_id").notNull(),
    draftToken: uuid("draft_token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("occurrence_edit_claims_owner_occurrence_uq").on(t.userId, t.occurrenceId),
    foreignKey({
      name: "occurrence_edit_claims_occurrence_fk",
      columns: [t.userId, t.occurrenceId],
      foreignColumns: [plannedOccurrences.userId, plannedOccurrences.id],
    }).onDelete("cascade"),
    ...serverWritePolicies("occurrence_edit_claims"),
  ],
).enableRLS();
