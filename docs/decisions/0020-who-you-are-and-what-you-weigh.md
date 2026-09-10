# 0020 — Who you are, and what you weigh

Status: accepted, 2026-09-10.

## Context

Three problems, all about the person rather than the training.

**Confirmation emails linked to `localhost`.** The app asked Supabase to send people back to
`<origin>/auth/confirm?next=/welcome`, and password resets to the same path with
`?next=/reset-password`. Supabase matches the **whole** redirect URL — query string included —
against the project's Redirect URLs, and `SETUP.md` told the operator to allow-list the plain
path. It therefore never matched, and Supabase did what it does when a redirect is not allowed:
used the project's **Site URL** instead, which on a new project is `http://localhost:3000`.
Nothing failed loudly. Sign-up said "check your inbox", the email arrived, and the link went to
a machine that was not serving the app.

**The profile did not know enough to be a profile.** It held a name, time zone, unit and an
optional body weight. Every one of them was optional in practice — the onboarding step accepted
an entirely empty form — so an account could reach Today knowing nothing about the person. No
height, no age, no reason for training.

**Body weight was recorded and then dropped.** Finishing a session asked for it and wrote it to
`workout_sessions.body_weight_kg`, where exactly one screen read it back: that session's own
details sheet. It never reached `profiles.body_weight_kg`, so the number on the profile was
whatever had last been typed into Settings, however old. There was no trend, and no way to
record a weight on a day that was not trained.

And a smaller thing running through all of it: `preferred_unit` was honoured for loads, but the
body weight field said "Body weight (kg)" to everyone, including accounts set to pounds.

## Decisions

1. **Ask Supabase for a bare path.** `emailRedirectTo` and `redirectTo` are now
   `<origin>/auth/confirm` and nothing else, so the entry `SETUP.md` asks for matches exactly.
   Where a link should land is worked out at `/auth/confirm` instead, from what the link is:
   `type=recovery`, or `exchangeCodeForSession`'s `redirectType`, means the password screen;
   anything else means Today, and an account that has not finished setup is forwarded to
   `/welcome` from there by the shell's own gate. A `next` parameter is still honoured, because
   links sent before this change carry one.

   `redirectType` is undeclared on `AuthTokenResponse` in @supabase/auth-js 2.116 though the
   client returns it, so it is read defensively: a version that stops sending it treats a
   recovery link as an ordinary confirmation, which lands on Today with a valid session rather
   than on an error.

2. **Setup asks, and asks properly.** The first `/welcome` step is now required, and collects
   name, time zone, units, body weight, height, date of birth, sex and a training goal. Sex may
   be left as "prefer not to say", which is stored as null; everything else must be answered.
   `profiles` gained `height_cm`, `date_of_birth`, `sex` and `training_goal`, and a check
   constraint that writes the bounds the forms already enforced down where the data lives.

   Accounts that predate a question are **not** sent back through setup. `onboarded_at` still
   means what it meant, and Settings names what is missing — on the profile row and above the
   form — so the answer is given in the one place that was always going to hold it.

3. **Height follows the weight unit.** There is no separate height preference: kilograms means
   centimetres, pounds means feet and inches. Both are stored once, in kilograms and
   centimetres, and converted at the edges. The unit control is live, so switching it re-labels
   the weight field and re-states the height without discarding a half-filled form. Conversions
   round so that a round trip returns the number that was typed — a lifter who weighs in pounds
   must not watch their weight drift a tenth every time the form is opened.

4. **Body weight is a record, not a field.** `body_weight_logs` holds one reading per day per
   account. Finishing a session with a weight writes one; changing the weight on the profile
   writes one. `recordBodyWeight` is the only thing that writes `profiles.body_weight_kg`, and
   it sets it from whichever reading is newest — so correcting last month cannot rewrite what
   somebody weighs now, while correcting today does. **Progress → Body** draws the trend above
   the muscle map, in the account's own unit.

   Migration `0010` backfills it: every weight already attached to a finished session becomes
   the reading for the day it was taken, resolved in that account's time zone, and the weight
   already on a profile becomes a reading dated when the profile was last written. Then every
   profile is re-pointed at its newest reading, so the invariant holds from the first day.

5. **The coach is told.** `planningContext` now carries height, age in years, sex and goal
   alongside body weight. Age rather than the birth date: the coach is planning training, and
   the date itself is one more identifying detail in a payload that does not need it.

## Consequences

- **A one-per-day record loses within-day detail.** Weighing yourself twice corrects the day
  rather than adding a point. That is the right shape for a trend and it means a second session
  on one day overwrites the first session's reading.
- **A stated weight's backfilled date is a guess.** `profiles.updated_at` moves for any profile
  write, so a weight backfilled at that date may be older than it appears. It is the only
  evidence there is, and the alternative — leaving the profile pointing at a number no reading
  supports — breaks the invariant on day one.
- **Existing accounts cannot save a profile until they complete it.** The Settings form parses
  with the same schema as setup, so an account with no height must add one before it can change
  its name. This is deliberate: the alternative is two definitions of a complete profile.
- **`SETUP.md` step 4.2 is now load-bearing** and says so. The failure it describes is silent
  at every layer, which is why it is written out twice — in the step, and again as its own
  section.
- Links already in inboxes keep pointing wherever they pointed. Nothing can be done about a
  sent email; signing up again, or asking for a new reset, is the fix.
