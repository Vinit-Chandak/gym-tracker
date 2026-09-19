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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { EndurancePrescription } from "../../domain/activity-prescription";
import { serverWritePolicies, timestamps } from "./common";
import { activitySportEnum } from "./multisport-enums";
import { profiles } from "./profiles";

/**
 * A reusable session, without a date and without results (plan §5.1, PLAN-01).
 *
 * Templates are versioned rather than edited in place. Scheduling one copies the revision it
 * had at that moment, so changing a template next month changes what you pick next month and
 * nothing that is already on the calendar. Deleting archives, because a scheduled occurrence
 * and a logged activity still point at the revision they were built from.
 *
 * Strength keeps its existing saved routines: they are adapted into the shared picker, not
 * rewritten as endurance steps.
 */
export const activityTemplates = pgTable(
  "activity_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    sport: activitySportEnum("sport").notNull(),
    name: text("name").notNull(),
    notes: text("notes"),
    currentRevisionId: uuid("current_revision_id"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("activity_templates_owner_id_uq").on(t.userId, t.id),
    uniqueIndex("activity_templates_owner_id_sport_uq").on(t.userId, t.id, t.sport),
    index("activity_templates_owner_sport_idx").on(t.userId, t.sport, t.archivedAt),
    check("activity_templates_name_chk", sql`length(name) between 1 and 120`),
    // Endurance only for now: strength templates remain the existing saved routines.
    check("activity_templates_sport_chk", sql`sport <> 'strength'`),
    ...serverWritePolicies("activity_templates"),
  ],
).enableRLS();

/** One immutable version of a template. Referenced revisions stay readable after archival. */
export const activityTemplateRevisions = pgTable(
  "activity_template_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    sport: activitySportEnum("sport").notNull(),
    version: integer("version").notNull().default(1),
    prescription: jsonb("prescription").$type<EndurancePrescription>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("activity_template_revisions_owner_id_uq").on(t.userId, t.id),
    uniqueIndex("activity_template_revisions_version_uq").on(t.userId, t.templateId, t.version),
    foreignKey({
      name: "activity_template_revisions_template_fk",
      columns: [t.userId, t.templateId, t.sport],
      foreignColumns: [activityTemplates.userId, activityTemplates.id, activityTemplates.sport],
    }).onDelete("cascade"),
    check("activity_template_revisions_version_chk", sql`version >= 1`),
    ...serverWritePolicies("activity_template_revisions"),
  ],
).enableRLS();
