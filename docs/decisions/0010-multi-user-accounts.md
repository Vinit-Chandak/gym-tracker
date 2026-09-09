# 10. From one lifter to many

Date: 2026-09-09

## Status

Accepted.

## Context

The app was built for one person. That showed everywhere:

- `npm run db:seed` created **that person's** three gyms, the machines at one of them, and their
  8-week programme, keyed off a `SEED_USER_EMAIL` environment variable.
- There was no sign-up screen. `SETUP.md` told the operator to create the single account by
  hand in the Supabase dashboard and then switch public sign-ups **off**.
- There was no way to get a programme other than that seed, and no UI to make one, so a second
  account would have found the Today tab permanently empty.
- Defaults that were one person's preferences applied to everybody: the time zone
  (`Asia/Kolkata`), the training week (Tuesday–Monday, because that is when their programme
  started), and kilograms with no way to change them.
- Absolute loads from one training history ("~55–60 kg by RIR", "DB history 17.5–22.5 kg each")
  were written into the shared programme data.

Friends now want to use it.

## Decision

### Seed only what is genuinely shared

`npm run db:seed` writes equipment types, the exercise library, the exercise→equipment mapping
and warm-up protocols. Nothing else. It creates no gyms, registers no machine at any gym, and
creates no programme, because those belong to a person.

The catalogues grew to match: 72 equipment types (from 32) and 122 exercises (from 44), so a
new account can describe a normal commercial gym and log a normal session without adding
anything of its own first.

`SEED_USER_EMAIL` and `src/db/seed/data/gyms.ts` are gone. The populated account the tests need
moved to `src/db/test/fixtures.ts`, where it is a fixture rather than something shipped.

### Programmes are blueprints

A programme is described by `ProgramBlueprint` (`src/domain/program-blueprint.ts`): a Zod-validated,
versioned document naming exercises, equipment and warm-ups by their shared slug rather than by
database id. `createProgramFromBlueprint` materialises one into a user's own rows.

The 8-week plan is now a template — one blueprint in a registry — which any account can adopt
from onboarding or Settings, choosing its own start date. Adopting copies it, so edits and
history belong to the adopter. Its absolute kilo targets were rewritten as effort ("Pick the
load by RIR, not by a number"), because a shared template cannot know anybody's numbers.

This was chosen over building a programme editor because it is the seam the eventual
plan-generating features need anyway: a generated or revised plan is another blueprint on the
same path. `createProgramFromBlueprint` already accepts a `familyId`, so a revision lands as
version _n+1_ of an existing lineage while logged sessions keep pointing at what they were
actually prescribed.

### Real accounts

Sign-up, sign-in, forgot password, reset password, change password and delete account.
All emailed links land on `/auth/confirm`, which accepts both the `code` of Supabase's default
templates and the `token_hash` + `type` of the server-side flow, so the app works whichever the
project is configured for. Sign-up works with email confirmation on or off.

Deleting an account deletes the profile, which cascades through every user-owned table.
Removing the Supabase _sign-in record_ needs the service-role key, which this project otherwise
refuses to hold; it is used only if `SUPABASE_SERVICE_ROLE_KEY` is set, and the UI says plainly
what happens when it is not.

### A first run that ends with something to train

`/welcome` is four steps — profile, first gym, that gym's machines, a programme — each skippable,
gated by `profiles.onboarded_at`. Without it a new account has no gym, and without a gym no
session can be started at all.

### Per-account defaults

- Time zone defaults to `UTC` in the database and is proposed from the device during onboarding.
- The training week now runs Monday–Sunday for everyone. It was Tuesday–Monday only because one
  programme started on a Tuesday.
- `preferred_unit` (kg or lb) is editable and honoured: it is the unit for loads no machine
  decides, the default unit for newly registered machines, and the unit the library's own load
  increments are printed in.
- Body weight and the rest timer are editable in Settings.

## Consequences

- Existing accounts are unaffected: migration `0006` backfills `onboarded_at` for any profile
  that already has a gym, so nobody is sent through onboarding twice.
- Weekly buckets shift by a day for existing data. Nothing is recomputed or lost; the same
  sessions simply group Monday-first.
- Only one template ships. Adding more is adding blueprints, but until someone can write their
  own, the choice at onboarding is "this plan or none".
- `weighted-hyperextension` is active in the shared library again. It was switched off with a
  note about one person's back; that belongs to a person, not to everyone's exercise list.
