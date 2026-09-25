# Running the app on your own machine

Everything the app needs — Postgres, sign-in, the shared library, three accounts with a month of
training — on this machine, so `next dev` never touches the hosted project. Two long-running
processes and a one-time database setup.

## Six-account multisport audit

For the complete current release, use the isolated audit runner instead of hand-editing local
environment files. It creates `overload_audit`, applies migrations/backfills, and seeds six
accounts with all four sports, scheduled sessions, templates, coaching outcomes and empty states:

```sh
npm ci
npx playwright install chromium webkit
npm run audit:setup
npm run audit:build
npm run audit:auth   # keep running in terminal 1
npm run audit:start  # keep running in terminal 2; http://localhost:3100
```

Then run `npm run audit:screens`, `npm run audit:flows` and `npm run audit:db`.
The runner selects only loopback services, leaves `.env.local` untouched and disables external
coach dispatch. Accounts, configuration and coverage are documented in the
[22 September flow audit](audits/2026-09-22-flow-audit.md).

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

Install the browser versions matching the repository's Playwright dependency:

```sh
npx playwright install chromium webkit
```

`npm run audit:screens` checks the seeded audit app with iPhone 13, Pixel 7, narrow 320 px and
desktop contexts. It records screenshots, page errors and overflow; Android scans also run Axe.
`npm run audit:flows` exercises mutations, navigation, drafts, scheduling and PWA behavior in
Chromium and WebKit. These commands require the audit stack and fixture manifest above.

`npm run audit:recovery` exercises the real check-in form and all five recovery charts:
complete/partial answers, edits, workout completion, date filters, reload and Back, plus
light/dark accessibility and 320 px layouts. Run once normally and once with
`AUDIT_DEVICE=iphone` (in PowerShell, `$env:AUDIT_DEVICE = "iphone"`). It uses the local
Alex and Sam accounts, creates and finishes workouts, and can create Sam's first gym.
Newly seeded training histories also include complete, fatigue-only and skipped check-ins;
rerunning setup leaves existing accounts and their readings intact.

## Food audit

The food runner uses a dedicated local database and resets Sam's food fixtures. It also changes
Vinit's local body weight and food targets to check the missing-weight flow. Run the two browser
engines sequentially because they share these accounts. Use these PowerShell variables in each
terminal before the corresponding commands:

```powershell
$env:AUDIT_DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:5432/overload_audit_food'
npm run audit:setup
npm run audit:build
npm run audit:auth   # terminal 1, keep running
npm run audit:start  # terminal 2, keep running
```

In a third terminal with the same database variable:

```powershell
$env:AUDIT_PRODUCTION = 'true'
npm run audit:food
$env:AUDIT_BROWSER = 'webkit'
npm run audit:food
```

This covers availability, targets, the six meals, new foods kept by logging them, amounts that
scale a saved food, starring a meal under a name and adding it to another, changed portions and
corrected foods, swipe removal, a retried save after a lost reply, Today's totals, account
isolation, responsive sheets with Axe, and PWA behavior (ADR 0033). Results and screenshots go to
`output/food-audit/`. Where the installed browsers are older than this Playwright, point
`AUDIT_CHROMIUM_PATH` at a Chromium executable. The browsers are emulated; physical-device
installation and keyboard behavior still need a device check. See the
[food audit report](audits/2026-09-25-food-audit.md).

## Latency: how screens scale with the database round trip

`npm run audit:latency` measures each main screen's server time at several app↔database
round-trip times, with the statements behind it (ADR 0030). Start the app so it talks to the
script's proxy instead of straight to Postgres, then run it in a third terminal:

```sh
AUDIT_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:6543/overload_audit npm run audit:start
npm run audit:latency   # LATENCY_RTTS=0,2,24 LATENCY_RUNS=5 by default
```

Run it before and after a change to the data layer: a screen that waits for fewer round trips
in sequence grows more slowly with the round trip.

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
