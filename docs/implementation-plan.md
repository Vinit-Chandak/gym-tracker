# Implementation plan

Status: proposed after Phase 0 (2026-09-08). Phase 1 starts once the open questions at the end
are answered. Requirements come from the planning documents supplied with the project
(`PRODUCT_REQUIREMENTS.md`, `TRAINING_CONTEXT.md`, `DATA_MODEL_AND_ARCHITECTURE.md`,
`CLAUDE_CODE_IMPLEMENTATION_PROMPT.md` and the 8-week programme workbook).

## Target directory structure

```
src/
  app/
    (auth)/login/                 sign-in screen, rendered without the bottom navigation
    (app)/today/                  gym pick, planned day or ad hoc, recovery check-in, live session
    (app)/history/                sessions, runs, recovery log, machine-specific filters
    (app)/progress/               charts (Recharts): e1RM, weekly sets, run volume, symptoms
    (app)/gyms/[gymId]/           gym detail and equipment inventory
    (app)/exercises/[exerciseId]/ exercise library detail and per-gym availability
    (app)/workouts/[sessionId]/   session logging screen (Phase 4)
    (app)/settings/               profile, default gym, units, time zone, coach tokens
    api/coach/...                 read-only JSON endpoints for an external AI client (Phase 8)
  db/
    schema/                       Drizzle schema, one file per domain
    migrations/                   generated SQL migrations, committed
    seed/                         reference data + programme seed built from the workbook
    client.ts                     server-only database client
  domain/                         pure TypeScript rules: progression, comparable history,
                                  pace, estimated 1RM. Unit-tested with Vitest, no I/O.
  server/                         auth helpers, data access, server actions (Zod-validated)
  components/                     shell, ui primitives, feature components
  lib/                            formatting, dates, validation schemas
docs/decisions/                   architecture decision records
```

## Schema and migrations

- Drizzle ORM schema in TypeScript is the source of truth. `drizzle-kit generate` writes SQL
  migrations into `src/db/migrations/`; `drizzle-kit migrate` applies them. This works against
  any Postgres provider.
- UUID primary keys (`gen_random_uuid()`), `created_at`/`updated_at` timestamps, Postgres enums
  for closed vocabularies (resistance mode, unit, set type, load portability, run mode).
- Row Level Security on every user-owned table, written as part of the migrations.
- Tables: users/profiles, gyms, equipment_types, equipment_instances, exercises,
  exercise_equipment_options, programs, program_days, program_exercises,
  program_exercise_fallbacks, program_runs (planned weekly run targets), workout_sessions,
  workout_exercises, set_logs, runs, daily_recovery, program_change_proposals. Later:
  api_tokens (Phase 8), personal_records (derived, optional).
- Fields the workbook needs beyond the planning docs: rep range as `rep_min`/`rep_max`,
  RIR range as `rir_min`/`rir_max`, rest range as `rest_min_seconds`/`rest_max_seconds`,
  `prescription_type` (reps or duration) with `duration_min_seconds`/`duration_max_seconds`
  for timed work such as side planks, `per_side` for unilateral work, `superset_group` for
  paired exercises, free-text `progression_notes`, and a configurable smallest load increment
  on both exercises and equipment instances (drives "smallest configured load increase").
- Comparable-history rule: exercises with `load_portability = global` compare by exercise;
  `equipment_specific` compare by exercise + equipment instance; never merge stack numbers
  from different machines.
- Programme versioning: programme versions are immutable once active. Any edit goes through
  `program_change_proposals`; applying an approved proposal creates a new version, and
  workout history keeps pointing at the exact `program_exercises` row that was prescribed.

## Auth (pending the provider decision)

- Supabase route: Supabase Auth with `@supabase/ssr` cookie sessions, a `proxy.ts` guard for
  the `(app)` group, RLS policies on `auth.uid()`, and application queries run through a
  transaction that sets the authenticated role and claims so RLS applies to Drizzle queries too.
- Neon / Vercel Marketplace route: Auth.js with a single credentials or passkey user,
  a `proxy.ts` guard, and RLS driven by a per-request `SET LOCAL app.user_id`.
- Either way the service-role or owner connection string stays server-side only.

## Seeding

- Reference data (equipment types, canonical exercises with muscles, portability, defaults and
  form links, the 8-week programme template, the 8-week run progression) is seeded by a script
  and is idempotent (upsert by slug).
- Per-user data (the placeholder company gym with its known equipment, the user's active copy
  of the programme, default gym) is created by a one-tap "set up starter data" action after
  first sign-in, so seeds stay multi-user safe.

## Phases

0. Foundation and PWA shell: done.
1. Schema, auth, migrations, seeds, domain tests for comparable history.
2. Gym and equipment management.
3. Exercise library, equipment compatibility, per-gym availability.
4. Today: gym pick, planned or ad hoc session, recovery check-in, set logging, rest timer.
5. Deterministic progression engine and recovery-aware warnings.
6. Running log and weekly run volume.
7. History and analytics.
8. Coach read API with revocable read-only tokens.
9. PWA polish: loading/error states, optimistic saves, offline handling, install guidance.

## Open questions

Blocking for Phase 1:

1. Postgres and auth provider: Supabase (as the planning docs specify) or Neon via the Vercel
   Marketplace with Auth.js.
2. Sign-in method: email + password, or magic link.

Non-blocking (defaults in brackets, all changeable later):

3. Commit the planning documents into `docs/planning/` [not until confirmed; they contain
   personal health details].
4. Programme start date and week anchoring [set in Settings when activating; week 1 starts on
   that Monday].
5. Warm-up checklists from the workbook inside the app [seed them and show a collapsible
   checklist per session type].
6. Seeded gym set [one gym "Anytime Fitness (Company)", plus virtual "Outdoor" and "Home"].
7. Set-count mismatch between the WEEK and LIFTING sheets [the per-exercise LIFTING sheet is
   authoritative].
8. Paired slots: calf raise [Smith primary, leg-press calf press fallback]; wrist curl +
   reverse wrist curl [two exercises in one superset group].
9. Bodyweight movements [log added load in kg, 0 for bodyweight; assisted pull-up is its own
   exercise on the assisted machine].
10. Units and time zone [kg; time zone from the browser on first sign-in, editable].
11. Home-screen name [short name "Training", full name "Training Tracker"].
