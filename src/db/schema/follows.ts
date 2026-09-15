import { sql } from "drizzle-orm";
import { check, index, pgPolicy, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

import { followStatusEnum } from "./enums";
import { profiles } from "./profiles";

/** `(select auth.uid())` — the subselect lets Postgres cache it per statement. */
const AUTH_UID = sql.raw("(select auth.uid())");

/**
 * One row per follow (ADR 0026): `follower_id` asked to see `followee_id`'s shared training.
 * Both sides may read and delete the row (unfollow, cancel, decline, remove follower); only the
 * follower may create it and only the followee may update it (accept). `status` is never
 * trusted from the client: a `before insert` trigger in the migration sets it from the
 * followee's `follow_approval`, and a `before update` trigger allows only pending → accepted.
 */
export const follows = pgTable(
  "follows",
  {
    followerId: uuid("follower_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    followeeId: uuid("followee_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    status: followStatusEnum("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followeeId] }),
    check("follows_not_self_chk", sql`follower_id <> followee_id`),
    index("follows_followee_status_idx").on(t.followeeId, t.status),
    index("follows_follower_status_idx").on(t.followerId, t.status),
    pgPolicy("follows_select", {
      for: "select",
      to: authenticatedRole,
      using: sql`follower_id = ${AUTH_UID} or followee_id = ${AUTH_UID}`,
    }),
    pgPolicy("follows_insert", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`follower_id = ${AUTH_UID}`,
    }),
    pgPolicy("follows_update", {
      for: "update",
      to: authenticatedRole,
      using: sql`followee_id = ${AUTH_UID}`,
      withCheck: sql`followee_id = ${AUTH_UID}`,
    }),
    pgPolicy("follows_delete", {
      for: "delete",
      to: authenticatedRole,
      using: sql`follower_id = ${AUTH_UID} or followee_id = ${AUTH_UID}`,
    }),
  ],
).enableRLS();
