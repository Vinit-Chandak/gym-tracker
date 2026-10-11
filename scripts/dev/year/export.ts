/**
 * Copies the simulated year out of PGlite into a local Postgres the app can serve, table by
 * table, with COPY. The target already has the same migrations applied, so the columns line up;
 * the shared library is copied too, which keeps every exercise and machine id the year refers to.
 */
import { randomBytes, scryptSync } from "node:crypto";

import postgres from "postgres";

import type { TestDatabase } from "@/db/test/pglite";

/** Only a loopback database named for this purpose is ever overwritten. */
export function assertYearDatabase(url: string): void {
  const target = new URL(url);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
    target.search !== "" ||
    target.hash !== "" ||
    !/^\/overload_audit_year(?:_[a-z0-9]+)*$/.test(target.pathname)
  )
    throw new Error("The year is only written to a loopback database named overload_audit_year.");
}

function password(): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync("password123", salt, 32).toString("hex")}`;
}

export async function exportToPostgres(
  t: TestDatabase,
  url: string,
): Promise<Record<string, number>> {
  assertYearDatabase(url);
  const tables = (
    await t.client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
    )
  ).rows.map((row) => row.table_name);
  const users = (
    await t.client.query<{ id: string; email: string; raw_user_meta_data: unknown }>(
      "select id, email, raw_user_meta_data from auth.users order by email",
    )
  ).rows;
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  const counts: Record<string, number> = {};
  try {
    await sql.begin(async (tx) => {
      // Rows arrive in table order, not dependency order: constraints and triggers wait.
      await tx.unsafe("set local session_replication_role = replica");
      await tx.unsafe(
        `truncate auth.refresh_tokens, auth.users, ${tables.map((name) => `public."${name}"`).join(", ")} cascade`,
      );
      for (const user of users)
        await tx`insert into auth.users (id, email, raw_user_meta_data, encrypted_password)
          values (${user.id}, ${user.email}, ${JSON.stringify(user.raw_user_meta_data)}::jsonb, ${password()})`;
      for (const table of tables) {
        const result = await t.client.query(`copy public."${table}" to '/dev/blob'`);
        const text = result.blob ? await result.blob.text() : "";
        counts[table] = text ? text.split("\n").filter(Boolean).length : 0;
        if (!text) continue;
        const stream = await tx.unsafe(`copy public."${table}" from stdin`).writable();
        await new Promise<void>((resolve, reject) => {
          stream.on("error", reject);
          stream.on("finish", resolve);
          stream.end(text);
        });
      }
    });
  } finally {
    await sql.end();
  }
  return counts;
}
