# ADR 0002: Supabase Postgres + Supabase Auth, Drizzle ORM, RLS through role switching

Date: 2026-09-08
Status: accepted

## Context

The planning documents specify Supabase Postgres, Supabase Auth and Row Level Security. The
user confirmed Supabase (free tier), email + password sign-in, kg everywhere, the
`Asia/Kolkata` time zone, a programme start date of 2026-09-08 anchored on that day rather
than on Mondays, three gyms (Anytime Fitness, Samsung Gym, Society Gym), one "warm-up done"
entry per session instead of per-drill logging, and bodyweight movements logged as added load
on top of bodyweight.

## Decisions

1. **Drizzle ORM is the schema source of truth.** `src/db/schema/*.ts` → `drizzle-kit generate`
   → SQL files in `src/db/migrations/` (committed) → applied with `npm run db:migrate`.
   Reasons: typed queries for analytics, migrations reviewable in git, and the same migrations
   run against real Postgres in tests via PGlite.

2. **RLS on every table, enforced for the app's own queries.** Policies are declared next to
   the tables with Drizzle's `pgPolicy` and Supabase's `auth.uid()`. Application queries run
   inside `withUser(userId, fn)`, a transaction that sets the JWT claims and `set local role
authenticated`, so the policies apply to Drizzle as they do to PostgREST. The connection
   string user (`postgres`) bypasses RLS only for migrations and the seed CLI.

3. **Every user-owned table carries `user_id`**, including child tables such as `set_logs`.
   Policies stay one-line (`user_id = auth.uid()`), indexes stay simple, and no policy needs
   joins. Ownership consistency between parent and child rows is enforced by the app layer.

4. **`profiles` mirrors `auth.users`.** A trigger creates the profile on sign-up; the app also
   upserts it on first use for users created before the migration ran.

5. **Machine identity is never lost.** `workout_exercises.equipment_instance_id` and
   `workout_sessions.gym_id` use `ON DELETE RESTRICT`; equipment and gyms are archived
   (`is_active = false`) instead of deleted. Comparable history for equipment-specific
   exercises filters on exercise + equipment instance (see `src/domain/comparable-history.ts`).

6. **Programme versions are immutable rows.** `programs` has `family_id` + `version`; edits go
   through `program_change_proposals` and create a new version. `workout_exercises` point at the
   `program_exercises` row that was prescribed at the time.

7. **Two-tier seeding.** `seedReferenceData` upserts global rows by slug (equipment types,
   canonical exercises, equipment options, warm-up protocols). `seedUserStarterData` creates a
   user's gyms, Anytime Fitness equipment and their copy of the 8-week programme, skipping
   anything that already exists.

8. **Workbook interpretation.** The per-exercise LIFTING sheet is authoritative for set counts
   (16 / 19 / 14 / 13 / 18 / 10 per day, counting Wednesday's forearm pair as 2 sets of each
   movement); the WEEK sheet summary was under-counted. Ranges are
   stored as min/max columns (reps, RIR, rest, duration). "Smith calf raise OR leg-press calf
   press" becomes Smith calf raise with leg-press calf press as a typed fallback. "Wrist curl +
   reverse wrist curl" becomes two exercises sharing a superset group. The Romanian deadlift is
   seeded as the dumbbell variant because the sheet references dumbbell history.

9. **PGlite for database tests.** Tests boot an in-process Postgres, install a small stub of
   Supabase's `auth` schema and roles, run the real migrations, seed, and assert RLS isolation
   and the FK behaviour above. No external database is needed to run `npm test`.

## Consequences

- `npm run db:setup` needs `DIRECT_DATABASE_URL` and (for user data) `SEED_USER_EMAIL`.
- Runtime needs `DATABASE_URL` (transaction pooler; the driver runs with `prepare: false`).
- If a future Supabase change removes the `postgres` role's membership in `authenticated`,
  `withUser` would fail loudly rather than silently bypass RLS.
