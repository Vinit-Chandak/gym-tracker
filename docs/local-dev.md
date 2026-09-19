# Running the app on your own machine

Everything the app needs — Postgres, sign-in, the shared library, three accounts with a month of
training — on this machine, so `next dev` never touches the hosted project. Two long-running
processes and a one-time database setup.

## What stands in for Supabase

| Hosted                        | Local                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| Supabase Postgres             | PostgreSQL on `localhost:5432`, database `overload_dev`                                   |
| Supabase Auth (GoTrue)        | `scripts/dev/auth-stub.mjs` on `127.0.0.1:54321` — password sign-in, sign-up, refresh     |
| `auth.users`, `auth.uid()`    | The same stub SQL the test suite uses (`src/db/test/pglite.ts`), plus a password column   |
| Asymmetric session signing    | An ES256 key the stub generates once and keeps in `auth.dev_signing_key`                  |
| `anon` / `authenticated` role | Created by the stub SQL; `withUser()` switches to `authenticated`, so RLS applies as live |

The app code is unchanged: it talks to `NEXT_PUBLIC_SUPABASE_URL` and `DATABASE_URL` exactly
as in production, and `getClaims()` verifies the stub's sessions against the stub's JWKS the
way it verifies Supabase's. Email confirmation, password-reset mail and rate limiting do not
exist here; sign-up signs you straight in.

## One-time setup

Needs PostgreSQL 15+ running locally with a `postgres` superuser (the commands assume password
`postgres`; adjust the URLs if yours differs) and Node 20.9+.

```sh
# 1. The database and the auth stand-in
psql -U postgres -h localhost -c "create database overload_dev"
psql -U postgres -h localhost -d overload_dev -f scripts/dev/auth-stub.sql

# 2. Schema and the shared library, pointed at it explicitly
#    (the db:* scripts read .env.local, which is the hosted project — never run them bare)
DATABASE_URL=postgres://postgres:postgres@localhost:5432/overload_dev \
DIRECT_DATABASE_URL=postgres://postgres:postgres@localhost:5432/overload_dev \
  npm run db:setup

# 3. Three accounts with training, follows and body weight
npm run dev:seed
```

Then create `.env.development.local` (git ignores every `.env*` but the example):

```sh
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=dev-anon-key
DATABASE_URL=postgres://postgres:postgres@localhost:5432/overload_dev
DIRECT_DATABASE_URL=postgres://postgres:postgres@localhost:5432/overload_dev
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SUPABASE_JWKS=
SUPABASE_SERVICE_ROLE_KEY=dev-service-role-key
```

`next dev` reads this file _over_ `.env.local`, so development is local by default while
`.env.local` stays what `next build`, `next start` and the `db:*` scripts see. The empty
`SUPABASE_JWKS` matters: it blanks any embedded production keys so sessions are verified
against the stub's.

## Every day

```sh
npm run dev:auth     # terminal 1: the auth stand-in
npm run dev          # terminal 2: the app, on http://localhost:3000
```

Sign in as any of the seeded accounts, password `password123`:

| Email                 | Handle      | What they have                                                            |
| --------------------- | ----------- | ------------------------------------------------------------------------- |
| `vinit@local.test`    | `@vinit`    | Six weeks of push/pull/legs, four runs, body weight shared; follows both  |
| `shreyash@local.test` | `@shreyash` | Four weeks of bench/deadlift days, body weight shared; follows vinit back |
| `priya@local.test`    | `@priya`    | Runs most days, lifts a little, body weight private; her request to vinit |
|                       |             | is waiting on his Friends page                                            |

Vinit and Shreyash share bench press, lateral raise, hammer curl, plank and pull-up, so
Compare, the exercise leaderboard and the "÷ body weight" rankings all have something to show.
Sign-up on `/signup` works too and makes a fresh account with an empty history.

## Phone-sized checks without a phone

The Playwright browsers already on this machine (`~/AppData/Local/ms-playwright`) match
`playwright-core@1.53`. From any scratch directory:

```sh
npm init -y && npm install playwright-core@1.53.0
```

then a short script with `devices["iPhone 13"]` or `devices["Pixel 7"]` for the context, sign in
through `/login`, and `page.screenshot({ fullPage: true })` per route. Check
`document.documentElement.scrollWidth > clientWidth` on each page: the app should never scroll
sideways at 320 px.

## Coaching screens

The three accounts have training but no coaching: no proposal to approve, no requests, no
reviews. [Auditing the coaching screens](coaching-audit.md) adds those, and says what each
decision must leave behind.

## Starting over

```sh
psql -U postgres -h localhost -c "drop database overload_dev" -c "create database overload_dev"
```

and repeat the setup. Dropping just the three accounts is enough to re-seed them:
`delete from auth.users where email like '%@local.test'` cascades to everything they own.
