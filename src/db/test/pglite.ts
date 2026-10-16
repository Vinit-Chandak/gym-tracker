import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";

import * as schema from "../schema";

/**
 * Minimal stand-in for the parts of Supabase that the migrations rely on:
 * the `auth.users` table, `auth.uid()` and the predefined roles.
 */
export const SUPABASE_AUTH_STUB_SQL = `
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;
`;

export type TestDatabase = {
  db: PgliteDatabase<typeof schema>;
  client: PGlite;
  createAuthUser(email: string): Promise<{ id: string; email: string }>;
  close(): Promise<void>;
};

/** In-process Postgres with the real migrations applied. */
export async function createTestDatabase(
  options: { throughMigration?: number } = {},
): Promise<TestDatabase> {
  const client = new PGlite();
  await client.exec(SUPABASE_AUTH_STUB_SQL);
  const db = drizzle(client, { schema });
  if (options.throughMigration === undefined) {
    await migrate(db, { migrationsFolder: "src/db/migrations" });
  } else {
    // Upgrade tests need an actual old schema, not the latest schema with its ledger erased.
    const migrations = readMigrationFiles({ migrationsFolder: "src/db/migrations" }).slice(
      0,
      options.throughMigration + 1,
    );
    await client.exec(
      "CREATE SCHEMA drizzle; CREATE TABLE drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint);",
    );
    for (const migration of migrations) {
      await client.exec(migration.sql.join("\n"));
      await client.query(
        "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
        [migration.hash, migration.folderMillis],
      );
    }
  }
  return {
    db,
    client,
    async createAuthUser(email) {
      const id = crypto.randomUUID();
      await client.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      return { id, email };
    },
    close: () => client.close(),
  };
}
