# Overload

Private, iPhone-first workout tracker for one lifter who trains at several gyms.
It logs strength and hypertrophy sessions, easy runs, recovery and symptoms, and keeps machine
history **per gym and per machine**, so stack numbers from different equipment are never mixed.

Progressive overload, one set at a time.

## Stack

- [Next.js](https://nextjs.org) 16 (App Router, Turbopack) on Vercel
- TypeScript (strict), React 19, Tailwind CSS v4
- Supabase Postgres + Supabase Auth (email and password), Row Level Security on every table
- Drizzle ORM for the schema, SQL migrations and queries; Zod for input validation
- Vitest, with PGlite running the real migrations in-process for database tests
- PWA manifest so the app installs from iPhone Safari

## Status

| Phase | Scope                                        | Status  |
| ----- | -------------------------------------------- | ------- |
| 0     | Repository foundation, PWA shell, bottom nav | done    |
| 1     | Database schema, auth, migrations, seed data | done    |
| 2     | Gym and equipment management                 | done    |
| 3     | Exercise library and gym compatibility       | done    |
| 4     | Today's workout and set logging              | done    |
| 5     | Deterministic progression engine             | pending |
| 6     | Running                                      | pending |
| 7     | History and analytics                        | pending |
| 8     | Coach read API                               | pending |
| 9     | PWA polish                                   | pending |

- [`SETUP.md`](SETUP.md): the one-time steps to create the Supabase and Vercel projects.
- [`docs/implementation-plan.md`](docs/implementation-plan.md): structure, phases and decisions.
- [`docs/decisions/`](docs/decisions/): architecture decision records.
- [`docs/planning/`](docs/planning/): the original requirements, training context and workbook.

## Local setup

Requires Node.js 20.9 or newer (Node 22 recommended) and npm.

```bash
npm install
cp .env.example .env.local   # fill in the values described in SETUP.md
npm run db:setup             # apply migrations, seed reference data and your starter data
npm run dev                  # http://localhost:3000
```

The app shell renders without any environment variables, but signing in and every data screen
need the Supabase values from `SETUP.md`.

## Scripts

| Command               | What it does                                                           |
| --------------------- | ---------------------------------------------------------------------- |
| `npm run dev`         | Start the development server                                           |
| `npm run build`       | Production build                                                       |
| `npm run start`       | Serve the production build                                             |
| `npm run lint`        | ESLint (Next.js core-web-vitals + TypeScript rules)                    |
| `npm run format`      | Prettier, writes changes (`format:check` only checks)                  |
| `npm run typecheck`   | Generate Next.js route types, then `tsc --noEmit`                      |
| `npm test`            | Vitest: domain rules, seed integrity, migrations + RLS on PGlite       |
| `npm run check`       | lint + format check + typecheck + tests                                |
| `npm run db:generate` | Generate a SQL migration from the Drizzle schema                       |
| `npm run db:migrate`  | Apply migrations to `DIRECT_DATABASE_URL`                              |
| `npm run db:seed`     | Seed reference data, and your starter data if `SEED_USER_EMAIL` is set |
| `npm run db:setup`    | `db:migrate` followed by `db:seed`                                     |
| `npm run db:studio`   | Drizzle Studio against the configured database                         |

## Project structure

```
src/
  app/
    layout.tsx, manifest.ts     metadata, viewport, PWA manifest
    (auth)/login/               sign-in screen (no bottom navigation)
    (app)/                      the five tabs behind the shared shell
      today/ history/ progress/ settings/
      gyms/, gyms/new, gyms/[gymId], .../edit, .../equipment/new, .../equipment/[equipmentId]
      gyms/[gymId]/programme, .../programme/[exerciseId]/fallback
      exercises/, exercises/[exerciseId]
  proxy.ts                      refreshes the Supabase session; sends visitors to /login
  db/
    schema/                     Drizzle tables, enums and RLS policies (source of truth)
    migrations/                 generated SQL + the hand-written auth bridge
    seed/                       reference data, starter data, seed CLI
    client.ts, with-user.ts     postgres.js client; RLS-enforcing transaction wrapper
    test/pglite.ts              in-process Postgres for tests
  domain/                       pure rules: comparable history, equipment resolution, pace, calendar
  server/                       auth helpers, server actions, repositories, validation, queries
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

## Install on iPhone

Deploy to Vercel (see `SETUP.md`), open the URL in Safari, tap **Share**, then
**Add to Home Screen**. The app launches standalone with safe-area padding for the notch and
home indicator.
