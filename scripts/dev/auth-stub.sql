-- The parts of Supabase the migrations rely on, for a Postgres on your own machine: the auth
-- schema with a password column for scripts/dev/auth-stub.mjs, its refresh tokens and signing
-- key, auth.uid() reading the claims withUser() sets, and the three predefined roles. The same
-- shape src/db/test/pglite.ts gives the test suite. docs/local-dev.md has the steps.
--
--   psql -U postgres -h localhost -d overload_dev -f scripts/dev/auth-stub.sql

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  encrypted_password text,
  created_at timestamptz not null default now()
);
create table if not exists auth.refresh_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists auth.dev_signing_key (
  id int primary key default 1,
  private_jwk jsonb not null,
  public_jwk jsonb not null
);
create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant anon, authenticated, service_role to postgres;
