import { sql } from "drizzle-orm";
import { pgPolicy, timestamp } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** `(select auth.uid())` — the subselect lets Postgres cache it per statement. */
const AUTH_UID = sql.raw("(select auth.uid())");

/** Full access to rows whose `user_id` is the signed-in user. */
export function ownerPolicy(table: string, column = "user_id") {
  const owner = sql`${sql.raw(column)} = ${AUTH_UID}`;
  return pgPolicy(`${table}_owner`, {
    for: "all",
    to: authenticatedRole,
    using: owner,
    withCheck: owner,
  });
}

/** Read-only shared reference data (writes happen through migrations/seeds). */
export function readAllPolicy(table: string) {
  return pgPolicy(`${table}_read`, {
    for: "select",
    to: authenticatedRole,
    using: sql`true`,
  });
}

/** Rows with a null owner are shared reference data; owned rows are private to their owner. */
export function sharedOrOwnerPolicies(table: string, column = "user_id") {
  const owner = sql`${sql.raw(column)} = ${AUTH_UID}`;
  return [
    pgPolicy(`${table}_select`, {
      for: "select",
      to: authenticatedRole,
      using: sql`${sql.raw(column)} is null or ${sql.raw(column)} = ${AUTH_UID}`,
    }),
    pgPolicy(`${table}_insert`, { for: "insert", to: authenticatedRole, withCheck: owner }),
    pgPolicy(`${table}_update`, {
      for: "update",
      to: authenticatedRole,
      using: owner,
      withCheck: owner,
    }),
    pgPolicy(`${table}_delete`, { for: "delete", to: authenticatedRole, using: owner }),
  ];
}
