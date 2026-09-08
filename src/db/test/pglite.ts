import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

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
export async function createTestDatabase(): Promise<TestDatabase> {
  const client = new PGlite();
  await client.exec(SUPABASE_AUTH_STUB_SQL);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "src/db/migrations" });
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
