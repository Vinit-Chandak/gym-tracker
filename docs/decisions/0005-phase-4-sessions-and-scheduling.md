# ADR 0005: Phase 4 sessions, set logging and sequence scheduling

Date: 2026-09-08
Status: accepted

## Context

Phase 4 turns the plan into daily use: the Today screen, the session lifecycle (start, check-in,
log, finish), machine-specific set logging, and the rule for what happens when a planned day is
missed. The user decided: the planned day is shown first with a Start button; set entry has both
big plus/minus steppers and a keypad field; rows are faintly prefilled from the previous
comparable session and stay blank when there is none; the rest timer is an optional feature
behind a Settings toggle, off by default; missed days shift later sessions (the sequence rule
from commit 493e870 was confirmed); lifting and runs are separate sessions on run days;
exercises that are unknown or unavailable at the gym offer the configured fallback or a manual
pick; Finish takes optional notes and body weight; the check-in is documented for review in
[`docs/check-in.md`](../check-in.md).

## Decisions

1. **Slot events drive the schedule.** `program_slot_events` holds one row per
   (programme, cycle, day) with a status of `completed` or `skipped`, the calendar day it
   happened on, an optional note and, for completed training days, the session that completed
   it. Everything on Today is derived from these rows plus the programme's start date and start
   day: the next suggestion is the earliest slot without an event; "behind" counts pending
   slots whose calendar date has passed; the projected end date is today plus the pending
   slots. Nothing is tied to a weekday. The programme starts on 2026-09-08 at day 2 (Upper A),
   so cycle 1 has no Lower A slot.

2. **Rest slots are soft.** Starting a training session completes every pending rest slot
   before it in the sequence, so a rest day never blocks the next session. A rest day can also
   be marked done by hand. Skipping a training day records a `skipped` event with an optional
   reason; nothing later is dropped.

3. **Session start resolves each planned exercise at the chosen gym** using the Phase 3
   rule. Direct matches attach the machine; a resolvable configured fallback is substituted at
   start with a recorded reason; unknown or unavailable exercises keep the planned exercise and
   show a decision panel with the fallback options, "Add a fallback" (manual pick, optionally
   remembered as the gym's fallback) and "Register machine". Changing the exercise is refused
   once sets exist for it.

4. **Set logging is an upsert on (workout exercise, set index).** Each row shows a faint
   prefill from the previous comparable session: the set with the same index, else the last
   set already logged in this exercise. Tapping "Log set" with untouched fields logs the
   prefilled values; typing or stepping overrides them, and stepping starts from the prefill.
   Steps: weight from the machine's load increment, else the exercise default, else 2.5 kg;
   reps and RIR 1; seconds 5. Bodyweight movements log added load (0 = bodyweight).

5. **Per-exercise state is completed, skipped or open.** Skipping needs no sets and takes an
   optional reason; completing needs at least one set; both can be undone while the session
   is open. Finishing records the slot as completed for planned sessions only. Ad hoc sessions
   never advance the programme. A session can be discarded only while it has no sets.

6. **Starting a day that is already done serves its next pending cycle** ("Choose a day"), so
   a day can be repeated deliberately without breaking the sequence.

7. **Check-in is optional and comes after Start.** It writes the pre-session fields on the
   session row (sleep hours, sleep quality, energy, fatigue, soreness, lower back, left and
   right shin). It can be skipped or reopened while the session is open. Phase 5 turns these
   into recovery-aware warnings.

8. **Rest timer is client-only.** It persists its end time in the browser's local storage per
   session so it survives navigation, and only renders when the profile toggle is on.

9. **Run days show the run target on Today** (duration, RPE, pace and shin notes); runs are
   logged separately, starting in Phase 6.

10. **History is a plain list of finished sessions** opening the read-only session view;
    filters, runs and analytics belong to Phase 7.

## Consequences

- Migration `0003_sessions_and_schedule` adds `program_slot_events`, `programs.start_day_index`,
  `workout_sessions.cycle_index`, `workout_exercises.skipped_at` and
  `profiles.rest_timer_enabled`. Existing installs need `npm run db:migrate`.
- The scheduling rule is pure (`src/domain/schedule.ts`) and covered by unit tests; the
  session lifecycle is covered by PGlite tests under RLS.
- The screens have been type-checked, linted and built but not yet exercised against a live
  Supabase project; that happens when the database steps in `SETUP.md` are run.
