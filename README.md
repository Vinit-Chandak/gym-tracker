# Overload

A workout tracker for people who train at more than one gym. It logs strength and hypertrophy
sessions, easy runs, recovery and symptoms, and keeps machine history **per gym and per
machine**, so stack numbers from different equipment are never mixed.

Everybody signs up for their own account. Gyms, machines, programmes and history belong to one
person and nobody else can see them. What a friend may see is a short, separate list — a
finished workout's numbers, a run's distance and pace, the best of each lift — and only once
you have let them follow you (see [Friends](#friends)).

Progressive overload, one set at a time.

## Stack

- [Next.js](https://nextjs.org) 16 (App Router, Turbopack) on Vercel
- TypeScript (strict), React 19, Tailwind CSS v4
- Supabase Postgres + Supabase Auth (email and password), Row Level Security on every table
- Drizzle ORM for the schema, SQL migrations and queries; Zod for input validation
- Vitest, with PGlite running the real migrations in-process for database tests
- PWA manifest, so it installs from Chrome on Android and Safari on iPhone

## What a new account gets

1. **Sign up** with a name, a username, an email and a password (plus password reset, change
   and account deletion). The username is the handle friends find you by; a taken one is
   suffixed rather than refused, and it can be changed later.
2. **A five-step welcome**: about you → sports → first gym → tick the machines that gym has → pick a
   programme template, or skip. Step one asks only for a name, username, time zone and units;
   height, weight, age and a training goal are asked for when a programme is created, and
   everything is editable afterwards in **Profile → Edit profile**.
3. **Today**, which says what to train next and lets you log it.

Weights and heights are stored once, in kilograms and centimetres, and read back in whichever
units the account chose — pounds and feet, or kilograms and centimetres. Body weight is a
running record rather than a single field: finishing a session with a weight, or changing it on
the profile, writes that day's reading, the profile always shows the newest one, and
**Progress → Body** draws the trend.

The only thing shipped with the app is shared reference data: the equipment catalogue (92 kinds
of machine), the exercise library (268 movements, every muscle group covered), warm-up protocols
and the programme templates. It is one library, readable by everybody and owned by nobody, so a
new account has all of it on day one and adds only what its own gyms have. Nothing is seeded per
person.

Each exercise says how it is counted — reps, seconds held, or metres covered — so a farmer's
carry asks for a distance and a plank for a time. Rep-based sets record reps in reserve (RIR);
timed sets and carries record perceived effort (RPE), including in completed workout history.

- [`SETUP.md`](SETUP.md): the one-time steps to create the Supabase and Vercel projects.
- [`docs/implementation-plan.md`](docs/implementation-plan.md): structure, phases and decisions.
- [`docs/decisions/`](docs/decisions/): architecture decision records.
- [`docs/planning/`](docs/planning/): the original requirements and training context.
- [`docs/planning/FRIENDS_COMPARE_LEADERBOARD_PLAN.md`](docs/planning/FRIENDS_COMPARE_LEADERBOARD_PLAN.md)
  and [ADR 0026](docs/decisions/0026-friends-and-what-a-friend-can-see.md): following, comparison
  and leaderboards among friends, and the contract for what a follower can see.

## Friends

The fifth tab is **Profile**: who you are, then everything that used to be Settings. Its
**Friends** page is the one door to other people ([ADR 0026](docs/decisions/0026-friends-and-what-a-friend-can-see.md)):

- **Following, with approval.** Search by username or exact email, ask to follow, and the
  other person accepts or declines. An account can instead let anyone follow it. A follower
  sees your shared training; you see theirs only if you follow them back.
- **A person's page** (`/u/username`): name, handle, follower counts, and — if you may see it —
  their workouts, working sets and volume for a period, the shape of their muscle split, and
  their best lifts; or their runs, distance, time and best pace. Your own page shows exactly
  what a follower would see.
- **Compare**: you against a friend, head to head — both muscle splits on one radar, a bar
  pair per number for the period, and every comparable exercise you both did, each opening a
  comparison of that movement with the day each best was set and both trends on one chart.
- **Leaderboard**: you and the people you follow, ranked on a period's totals or on the
  all-time bests of one movement, with "per kg of body weight" rankings once two of you share
  your weight. Equal values share a rank; whoever has nothing for a metric reads "—".
- **Records** are announced when a workout finishes (a strict improvement over an earlier
  session; a first performance is not one), and friends' recent workouts and runs are a quiet
  list on the Friends page.

Both sports have their own switch on those screens: Lifting first, Running beside it.
Screenshots of each screen live in [`docs/friends/`](docs/friends/README.md).

Only movements from the shared library whose load means the same everywhere are compared or
ranked — a machine's stack numbers are its own — and estimated 1RM covers barbell and dumbbell
lifts. Everything is stored in kilograms and read back in the viewer's unit.

**Privacy** (Profile → Privacy) has four switches — approve requests, share training, share
body weight for relative strength (off by default), be findable by email — and lists, in plain
words, what a follower can and can never see. Nothing about other people is readable except
through three `shared_*` tables that the owner writes and an accepted follower may read; every
other table keeps its owner-only policy.

## Local setup

Requires Node.js 20.9 or newer (Node 22 recommended) and npm.

For a separate local database, local authentication and six test accounts with 56 months of
history, follow [the local audit setup](docs/audits/local-56-months.md). The
[comprehensive audit report](docs/audits/2026-09-26-comprehensive-audit.md) records the fixes,
screen coverage and verification commands.

```bash
npm install
cp .env.example .env.local   # fill in the values described in SETUP.md
npm run db:setup             # apply migrations and seed the shared library
npm run dev                  # http://localhost:3000
```

The app shell renders without any environment variables, but signing up and every data screen
need the Supabase values from `SETUP.md`.

## Scripts

| Command                            | What it does                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `npm run dev`                      | Start the development server                                                     |
| `npm run build`                    | Production build                                                                 |
| `npm run start`                    | Serve the production build                                                       |
| `npm run lint`                     | ESLint (Next.js core-web-vitals + TypeScript rules)                              |
| `npm run format`                   | Prettier, writes changes (`format:check` only checks)                            |
| `npm run typecheck`                | Generate Next.js route types, then `tsc --noEmit`                                |
| `npm test`                         | Vitest: domain rules, seed integrity, migrations + RLS on PGlite                 |
| `npm run check`                    | lint + format check + typecheck + tests                                          |
| `npm run db:generate`              | Generate a SQL migration from the Drizzle schema                                 |
| `npm run db:migrate`               | Apply migrations to `DIRECT_DATABASE_URL`                                        |
| `npm run db:seed`                  | Seed the shared library (no gyms, machines or programmes)                        |
| `npm run db:setup`                 | `db:migrate` followed by `db:seed`                                               |
| `npm run db:deploy`                | What a production deploy runs: migrate, then seed the library                    |
| `npm run db:backfill:shared-stats` | Rewrite friends' shared stats from history (idempotent; `db:deploy` ran it once) |
| `npm run db:studio`                | Drizzle Studio against the configured database                                   |

## Looking at a change without deploying it

Every real screen is behind sign-in and a database. `npm run dev` also serves `/preview` (the
day's cards, including a day that both lifts and runs), `/preview/logging` (the set grid in each
of its three measures) and `/preview/food` (the Food tab, with
`?state=first|empty|over|evening|noweight`; a meal's page with `?meal=breakfast`, adding
`&state=new` for an account with no foods yet; and `?page=targets`, `?page=my-foods` and
`?page=meal`, each taking `&state=first` or `&state=new` for its first use) against made-up
data, so the navigation, Today, logging and food can be seen on a phone before anything ships.
These routes exist in development only; a production build does not have them.

## Project structure

```
src/
  app/
    layout.tsx, manifest.ts     metadata, viewport, PWA manifest
    (auth)/                     sign in, sign up, forgot and reset password
    auth/confirm/               where every emailed link lands
    (onboarding)/welcome/       the four first-run steps
    (app)/                      the five tabs behind the shared shell
      today/ training/ food/ progress/ profile/
      progress/history/           History, one of Progress's sections
      profile/friends/            friends, leaderboard, compare; profile/privacy/
      u/[username]/               a person's page and the head-to-head comparisons
      gyms/[gymId]/..., exercises/..., workouts/[sessionId]/...
    (preview)/                  development-only screens: the shell without an account
  proxy.ts                      refreshes the Supabase session; keeps the app private
  db/
    schema/                     Drizzle tables, enums and RLS policies (source of truth)
    migrations/                 generated SQL + the hand-written auth bridge
    seed/                       shared reference data, programme templates, seed CLI
    test/                       PGlite database and the populated-account fixture
    client.ts, with-user.ts     node-postgres client; RLS-enforcing transaction wrapper
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

The three `shared_*` tables are the one exception to "owner-only", by design: their read policy
is `can_view_training(user_id)` (or `can_view_body_weight`), a security-definer function that
says whether the signed-in user is an accepted follower of the owner while the owner shares.
Every query against them still names the user ids it wants; the policy is the guarantee, not
the filter.

## Programmes are data, not code

A programme is described by a **blueprint** (`src/domain/program-blueprint.ts`): a validated,
versioned document that names exercises, equipment and warm-ups by their shared slug.
`createProgramFromBlueprint` turns one into a user's own rows.

The built-in templates are blueprints. So is anything that later generates or revises a plan —
an import, a coach, or a model given the exercise library — which is why that path already
supports continuing a programme's lineage as a new version rather than editing history.

## Install on a phone

Deploy to Vercel (see `SETUP.md`), then open the URL on the phone. **Profile → Install** offers
Chrome's install prompt on Android; on iPhone use Safari's **Share → Add to Home Screen**. The
app launches standalone with safe-area padding.

## Food

Calorie and macro tracking, entered by hand. The day has six meals: breakfast, morning snack,
lunch, afternoon snack, dinner and evening snack. **My foods** is a screen of its own: a food is
its kcal and, if known, carbohydrate, fat and protein for a portion in a real unit (100 g, 250 ml,
1 scoop), and a meal is a set of foods at amounts. Both are made there without logging anything,
and added to any meal of the day from its page; a new food can also be made from a meal's page
when a search finds nothing. Logging asks only how much, and the figures follow: 200 g of oats
saved per 100 g is twice everything.

**Targets** are a screen of their own too: the day's kcal, protein per kilogram of body weight and
fat as a share, with carbohydrate the rest, starting from a split the profile's training goal
chooses (55 / 25 / 20 by default). The Food tab shows the day against a goal band and each
macronutrient against its target; tapping one lists what today's foods gave it. Carbohydrate and
fat turn red past their targets, and protein green once reached. Every signed-in account has it
as the **Food** tab, where History used to be; History is now a section of **Progress**. See ADRs
[0032](docs/decisions/0032-food-behind-a-switch.md),
[0033](docs/decisions/0033-meals-of-the-day-and-my-foods.md),
[0034](docs/decisions/0034-food-takes-the-history-tab.md) and
[0035](docs/decisions/0035-targets-from-the-goal-and-my-foods-of-its-own.md).

Saving needs a connection. Retrying a save after a lost reply cannot log a food twice.
Production deployments apply database migrations before building the app.

## AI house coach

Optionally, a Claude Code routine on the owner's Claude subscription plans everyone's next
training day overnight: exercises and machines for their gym, sets, reps, RIR, loads and a
warm-up, with a one-line reason per exercise, and the run when the day runs. Today shows the
plan, starting the session prefills it, the run screen opens with the coach's numbers already
in it, and a re-plan at another gym is one tap away. When the programme itself is the problem,
the coach proposes a change and the athlete approves it under Profile → Programme, which writes
the next version rather than editing what was logged. Each athlete switches it on under
Profile → AI coach; the owner
sets it up once, as described in [`docs/coach-automation.md`](docs/coach-automation.md).

See [Coach API](docs/coach-api.md) for token setup and endpoint details. Unsaved workout set rows
are retained on the device for manual retry and removed after a confirmed save. Other forms
require a connection. The offline screen explains how to reconnect; private pages are not cached.
