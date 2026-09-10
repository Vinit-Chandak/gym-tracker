# Overload

A workout tracker for people who train at more than one gym. It logs strength and hypertrophy
sessions, easy runs, recovery and symptoms, and keeps machine history **per gym and per
machine**, so stack numbers from different equipment are never mixed.

Everybody signs up for their own account. Gyms, machines, programmes and history belong to one
person and nobody else can see them.

Progressive overload, one set at a time.

## Stack

- [Next.js](https://nextjs.org) 16 (App Router, Turbopack) on Vercel
- TypeScript (strict), React 19, Tailwind CSS v4
- Supabase Postgres + Supabase Auth (email and password), Row Level Security on every table
- Drizzle ORM for the schema, SQL migrations and queries; Zod for input validation
- Vitest, with PGlite running the real migrations in-process for database tests
- PWA manifest, so it installs from Chrome on Android and Safari on iPhone

## What a new account gets

1. **Sign up** with an email and password (plus password reset, change and account deletion).
2. **A four-step welcome**: name, time zone and units → first gym → tick the machines that gym
   has → pick a programme template, or skip.
3. **Today**, which says what to train next and lets you log it.

The only thing shipped with the app is shared reference data: the equipment catalogue (92 kinds
of machine), the exercise library (268 movements, every muscle group covered), warm-up protocols
and the programme templates. It is one library, readable by everybody and owned by nobody, so a
new account has all of it on day one and adds only what its own gyms have. Nothing is seeded per
person.

Each exercise says how it is counted — reps, seconds held, or metres covered — so a farmer's
carry asks for a distance and a plank for a time, and each may carry its own note on what reps
in reserve means for it.

- [`SETUP.md`](SETUP.md): the one-time steps to create the Supabase and Vercel projects.
- [`docs/implementation-plan.md`](docs/implementation-plan.md): structure, phases and decisions.
- [`docs/decisions/`](docs/decisions/): architecture decision records.
- [`docs/planning/`](docs/planning/): the original requirements and training context.

## Local setup

Requires Node.js 20.9 or newer (Node 22 recommended) and npm.

```bash
npm install
cp .env.example .env.local   # fill in the values described in SETUP.md
npm run db:setup             # apply migrations and seed the shared library
npm run dev                  # http://localhost:3000
```

The app shell renders without any environment variables, but signing up and every data screen
need the Supabase values from `SETUP.md`.

## Scripts

| Command               | What it does                                                     |
| --------------------- | ---------------------------------------------------------------- |
| `npm run dev`         | Start the development server                                     |
| `npm run build`       | Production build                                                 |
| `npm run start`       | Serve the production build                                       |
| `npm run lint`        | ESLint (Next.js core-web-vitals + TypeScript rules)              |
| `npm run format`      | Prettier, writes changes (`format:check` only checks)            |
| `npm run typecheck`   | Generate Next.js route types, then `tsc --noEmit`                |
| `npm test`            | Vitest: domain rules, seed integrity, migrations + RLS on PGlite |
| `npm run check`       | lint + format check + typecheck + tests                          |
| `npm run db:generate` | Generate a SQL migration from the Drizzle schema                 |
| `npm run db:migrate`  | Apply migrations to `DIRECT_DATABASE_URL`                        |
| `npm run db:seed`     | Seed the shared library (no gyms, machines or programmes)        |
| `npm run db:setup`    | `db:migrate` followed by `db:seed`                               |
| `npm run db:deploy`   | What a production deploy runs: migrate, then seed the library    |
| `npm run db:studio`   | Drizzle Studio against the configured database                   |

## Looking at a change without deploying it

Every real screen is behind sign-in and a database. `npm run dev` also serves `/preview` (the
day's cards, including a day that both lifts and runs) and `/preview/logging` (the set grid in
each of its three measures) against made-up data, so the navigation, Today and logging can be
seen on a phone before anything ships. These routes exist in development only; a production
build does not have them.

## Project structure

```
src/
  app/
    layout.tsx, manifest.ts     metadata, viewport, PWA manifest
    (auth)/                     sign in, sign up, forgot and reset password
    auth/confirm/               where every emailed link lands
    (onboarding)/welcome/       the four first-run steps
    (app)/                      the six tabs behind the shared shell
      today/ runs/ history/ progress/ gyms/ settings/
      gyms/[gymId]/..., exercises/..., workouts/[sessionId]/...
    (preview)/                  development-only screens: the shell without an account
  proxy.ts                      refreshes the Supabase session; keeps the app private
  db/
    schema/                     Drizzle tables, enums and RLS policies (source of truth)
    migrations/                 generated SQL + the hand-written auth bridge
    seed/                       shared reference data, programme templates, seed CLI
    test/                       PGlite database and the populated-account fixture
    client.ts, with-user.ts     postgres.js client; RLS-enforcing transaction wrapper
  domain/                       pure rules: blueprints, equipment resolution, pace, calendar
  server/                       auth helpers, server actions, repositories, validation
  components/                   shell, ui primitives
  lib/                          env access, app identity, helpers
docs/                           plan, ADRs, planning documents
```

## How data access works

Every user-owned table has a `user_id` column and a Row Level Security policy on `auth.uid()`.
Application code reads and writes inside `withUser(db, userId, fn)`, a transaction that sets the
Supabase JWT claims and switches to the `authenticated` role, so the policies apply to Drizzle
queries exactly as they do to Supabase's own API. Migrations and the seed CLI use the direct
connection instead.

## Programmes are data, not code

A programme is described by a **blueprint** (`src/domain/program-blueprint.ts`): a validated,
versioned document that names exercises, equipment and warm-ups by their shared slug.
`createProgramFromBlueprint` turns one into a user's own rows.

The built-in templates are blueprints. So is anything that later generates or revises a plan —
an import, a coach, or a model given the exercise library — which is why that path already
supports continuing a programme's lineage as a new version rather than editing history.

## Install on a phone

Deploy to Vercel (see `SETUP.md`), then open the URL on the phone. **Settings → Install** offers
Chrome's install prompt on Android; on iPhone use Safari's **Share → Add to Home Screen**. The
app launches standalone with safe-area padding.

## AI house coach

Optionally, a Claude Code routine on the owner's Claude subscription plans everyone's next
training day overnight: exercises and machines for their gym, sets, reps, RIR, loads and a
warm-up, with a one-line reason per exercise, and the run when the day runs. Today shows the
plan, starting the session prefills it, the run screen opens with the coach's numbers already
in it, and a re-plan at another gym is one tap away. When the programme itself is the problem,
the coach proposes a change and the athlete approves it in Settings, which writes the next
version rather than editing what was logged. Each athlete switches it on in Settings; the owner
sets it up once, as described in [`docs/coach-automation.md`](docs/coach-automation.md).

See [Coach API](docs/coach-api.md) for token setup and endpoint details. Unsaved workout set rows
are retained on the device for manual retry and removed after a confirmed save. Other forms
require a connection. The offline screen explains how to reconnect; private pages are not cached.
