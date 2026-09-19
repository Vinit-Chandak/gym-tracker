import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { serverWritePolicies, timestamps } from "./common";
import { profiles } from "./profiles";

/**
 * The ledger the migration is accountable to (plan §§10.2, 10.3).
 *
 * Every canonical row derived from a legacy one is recorded here, with the source it came
 * from and the reason it was mapped that way. Callers resolve an old identifier through this
 * table rather than deriving it again, which is what makes a year-old `run:<uuid>` in a coach
 * report still point at the right activity, and what makes re-running the backfill a no-op
 * instead of a second copy.
 */
export const multisportMigrationLinks = pgTable(
  "multisport_migration_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    /** `runs`, `workout_sessions`, `program_runs`, `program_slot_events`. */
    sourceKind: text("source_kind").notNull(),
    sourceId: uuid("source_id").notNull(),
    /** Bumped when a source is re-read after changing before cutover. */
    sourceVersion: integer("source_version").notNull().default(1),
    targetKind: text("target_kind").notNull(),
    targetId: uuid("target_id").notNull(),
    /** Why this mapping, in one word: `identity`, `minted`, `event`, `legacy_resolution`. */
    reason: text("reason").notNull(),
    /** Of the source fields that were carried over, so a re-run can tell a change from a copy. */
    checksum: text("checksum"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("multisport_links_source_uq").on(
      t.userId,
      t.sourceKind,
      t.sourceId,
      t.sourceVersion,
    ),
    index("multisport_links_target_idx").on(t.userId, t.targetKind, t.targetId),
    check(
      "multisport_links_kind_chk",
      sql`length(source_kind) between 1 and 60 and length(target_kind) between 1 and 60`,
    ),
    ...serverWritePolicies("multisport_migration_links"),
  ],
).enableRLS();

/**
 * What the migration would not guess at.
 *
 * Two runs claiming one plan, a completion naming a deleted record, a link that crosses
 * accounts: each is recorded against its owner and left alone. An open issue in a blocking
 * category holds the reconciliation gate for that account. Nothing here contains a
 * measurement or a note — the category and the identifiers are the whole story.
 */
export const multisportMigrationIssues = pgTable(
  "multisport_migration_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    sourceKind: text("source_kind").notNull(),
    sourceId: uuid("source_id"),
    relatedId: uuid("related_id"),
    status: text("status").notNull().default("open"),
    resolution: text("resolution"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("multisport_issues_uq").on(t.userId, t.category, t.sourceKind, t.sourceId),
    index("multisport_issues_status_idx").on(t.status, t.category),
    check("multisport_issues_status_chk", sql`status in ('open', 'resolved', 'accepted')`),
    ...serverWritePolicies("multisport_migration_issues"),
  ],
).enableRLS();
