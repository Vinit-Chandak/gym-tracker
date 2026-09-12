# Full app audit

Branch: `codex/full-app-qa`, based on `main`.

## Environment

The interactive audit uses a disposable local PostgreSQL database, seeded reference data,
and local test accounts. A local Supabase-compatible auth stub exercises the app's normal
authentication code without accessing the configured remote account. Delivery of real
authentication email and the external coach service cannot be verified with this stub.
Local QA infrastructure lives in the ignored `output/qa-runtime` directory.

## Coverage at the commit checkpoint

- Login: wrong credentials, successful sign-in, desktop and phone layout.
- Today: current-gym switching, plan details, additional actions, choose another day.
- Planned workout: check-in validation and advice, warm-up, session details, set saving,
  warm-up and working sets, set editing, local draft recovery, add/remove rows,
  complete/reopen exercise, technique and empty history, register/select a machine,
  create/edit/ungroup supersets, remembered and available fallbacks, skip/unskip with reasons,
  timed holds, decimal-distance carries, all set-type options, finish validation and notes,
  body-weight recording, and completed read-only logging.
- Profile: time-zone and body-weight validation, kg/lb and height conversion, saving preferences.
- Rest timer: enabled setting, workout and other-page visibility, extension, stop.
- History: populated workout/run/recovery list; activity, gym, exercise, and machine filters;
  empty results, clear filters, valid and invalid date ranges.
- Progress: all five sections and their measurements, machine/unit series, chart value tables,
  running pace by mode, recovery trends, body weight and body map, week navigation, date filtering,
  empty future range, and phone/desktop layouts.
- Runs: overview, new run validation, decimal/comma distance, live pace, all six shin readings,
  treadmill/outdoor modes, RPE, programme linking/unlinking, saving and editing. Deletion's
  confirmation control was opened; final deletion has not yet been exercised in the browser.
- Gyms: create, edit name/type, set default, archive the default, archived list and restore;
  register a stack-based cable station with additional details and invalid load increments;
  edit/archive/restore equipment, mark/unmark unavailable types, programme fit, fallback search,
  add/remove fallbacks, and compatible machine selection.
- Exercise library: search by name/muscle/equipment, empty search results, timed/free-weight/machine
  detail screens, programme prescriptions, recent history, availability, preferred-machine save
  and clear. The bench-press guide linked to a dumbbell chest press; corrected to NASM's matching
  barbell bench-press page.
- Settings appearance: Light/Dark/System, reload persistence and light-mode phone layout;
  installation help and Escape dismissal.
- Programme: replacement, date boundary input, cycle disclosures, mixed-day run targets,
  seeded change proposals (dismiss and apply), preservation of progress across a revision.
- Today: session skip with a reason, next-day progression, choosing an already skipped day,
  empty-session discard, independent run skip on a mixed day, rest/mobility content and
  completion, completed-programme state, and starting/finishing an empty ad hoc session.
- AI coach: enable, save notes and revisit them, unavailable-service request feedback and
  request count, seeded saved plan, coach warm-up, starting the prescribed workout, and
  verifying that one prescribed set produces one row after the fix.
- Coach access: approved local token creation with 30-day expiry, copy, hide, revoke;
  all six read endpoints returned 200, malformed date/limit requests returned 400,
  unauthenticated/revoked tokens returned 401, and a write request returned 405.
- Account: password screen labels and phone layout (no password entered), successful sign-out.

## Fixes and verification

- Registering equipment from a workout now attaches the compatible machine to that
  workout. Existing registered machines can also be selected from the logger.
  Repository tests cover compatibility, ownership, finished/logged workouts, and rollback.
- Five-option segmented controls now fit narrow phone cards.
- Form labels no longer nest other labels or include hints, errors, and select options
  in their accessible names. Invalid controls expose feedback and receive focus after submit.
  Component tests cover ordinary inputs, selects, and segmented groups.
- Check-in numeric validation uses readable range messages.
- Free-weight sets store the submitted unit. Display copies, progression history, and device
  drafts convert between kg and lb. Changes in preferences do not rewrite saved records.
  New coach plans retain the units they were generated in.
- Profile submission no longer resets the unit radio while leaving converted values visible.
- The rest timer remains visible within the workout, where the redundant resume strip is hidden.
- Decimal metres remain decimal in both set-entry interfaces.
- Working-set progress excludes warm-ups; completed workouts say View instead of Start/Resume.
- Finish summaries convert and label loads, and allow long values/reasons to wrap.
- Sign-in retains the email on failed attempts; history uses readable sleep units and set plurals.
- Progress retains the chosen section/measurement after date changes, and its week description
  correctly says Monday to Sunday. Body map tooltips use singular set counts.
- Equipment forms retain their selected type and unit after validation errors.
- Fallback machine choices are restricted to compatible active machines, per the user's answer;
  the repository also rejects incompatible, archived, and wrong-gym machines. Preferred-machine
  choices now use compatibility too, and keep the saved selection visible.
- Exercise history labels units and converts comparable free weights; bodyweight exercises without
  a load jump no longer say Machine.
- Theme changes no longer remove metadata nodes React owns, fixing a reproducible crash during
  navigation after Light/Dark/System changes. The same browser sequence passed after the fix.
- Programme date calculations and labels preserve accepted years below 100; programme-day
  counts include rest days without calling them lifting sessions.
- The logger respects the coach's set count and warm-up set types. Plan summaries include
  programme exercises the coach leaves unchanged, and volume warnings count their retained sets.
  Today can retain the coach plan belonging to an unfinished workout.
- Proposal dismissal no longer shows Applying; coach and programme counts use singular set labels.
- Failed reset-email requests no longer report success. Authentication return paths reject
  backslashes/control characters that could normalize into external redirects.

Baseline: 56 test files, 395 tests passed before changes.
Checkpoint validation: 65 test files and 419 tests passed; lint passed with no warnings;
the production build passed, including TypeScript and generation of all 35 static pages.
Lint excludes local output artifacts and the temporary `.next-qa` directory. Formatting and
whitespace checks cover the committed source and report. No live deployment was performed.
The broader source formatting check reports 175 pre-existing style warnings in untouched files;
those files were not reformatted as part of this checkpoint.

## Remaining interactive tests

This is a checkpoint, not a claim that every feature or combination has passed. Automated
tests cover some of the cases below; they still need the indicated browser/device checks.

### Authentication and new-account setup

- Sign-up: empty/invalid fields, mismatched passwords, existing address, successful local
  account creation, name/email retention after errors, and confirmation-required state.
- All four onboarding steps: profile, first gym, starter machines, programme; validation,
  unit/time-zone choices, machine search/selection, back/resume behavior, and every skip path.
- Empty-account states: no gyms, no programme, no history/runs/progress; completing setup later.
- Forgot-password request UI, invalid/expired/used confirmation links, successful real-email
  confirmation and recovery. Local auth does not deliver email or reproduce Supabase email flows.
- Actual password change/reset and subsequent sign-in. The page was inspected and the action
  was tested with mocks; browser credential changes require the user to complete the final flow.
- Delete-account page, confirmation validation, deletion, post-deletion sign-in/data state,
  and sign-in-provider deletion success/failure. No account was deleted.
- End-to-end verification of the return-path and reset-request failure fixes.

### Workouts, runs, and scheduling

- Final run deletion and confirmation/cancellation; final deletion of a saved workout set.
- Full mixed-day completion in both orders (run first/lifting first), and changing/deleting a
  linked run after it has completed a programme day. Independent run skip was verified.
- The rest-day “Start the next lifting day instead” action; rest completion itself passed.
- Skipped-day reopening/next-cycle behavior after the user's decision below; completed-day
  selection and all-slots-complete selection also need focused checks.
- Fresh browser checks of the final completed-workout View labels, formatted finish summary,
  and saved-set unit labels across kg/lb; major logging/unit-switch flows passed earlier.
- Fresh browser recheck of the profile form-reset fix after saving and switching units.
- Confirm the corrected early-year programme end date by repeating the boundary browser case.
- Real offline/reconnect saves, conflicting edits in two tabs/devices, session expiry during
  a save, and recovery after interrupted finish/discard. Mocked draft/retry tests are not a
  substitute for these end-to-end failure checks.
- Run RPE clearing: currently an optional selected RPE cannot be cleared through its selector.
  This remains an open interaction finding.

### Coach and programme integrations

- Real coach execution/delivery, scheduled requests, pending-to-ready auto-refresh, timeout,
  quota exhaustion, retry, and a plan arriving while the user changes gym/day or starts logging.
- Gym-mismatch plans and re-planning; disable/re-enable behavior with an existing plan.
- Fresh browser rechecks of partial-plan totals/list, retained-volume warning correction,
  and the coach plan retained on Today during an unfinished workout. Regression tests pass.
- Coach substitutions/drops/additions, supersets, per-side/timed/distance prescriptions and
  coach-run instructions through full logging; mid-workout unit changes on a coach-generated plan.
- Proposal rejection's corrected pending label, applying while a workout is open, stale/conflicting
  proposals, failure/retry, and multiple sequential revisions. Basic apply/reject passed.
- Token 90-day/one-year expiry, actual expiry, ten-token limit, repeated creation/copy state,
  clipboard failure, pagination/date limits, and cross-account API isolation in browser/API
  end-to-end checks. The approved 30-day token was tested and revoked.

### Remaining visual and platform coverage

- Finish the phone/tablet/desktop sweep of every remaining auth/onboarding/account/proposal
  state. Existing spot checks used 320, 390 and 1280 pixel widths, not every screen at every size.
- Explicit Light/Dark browser chrome after route changes; System navigation and reload were
  rechecked. Also keyboard-only navigation/focus and screen-reader behavior across all screens.
- Real iPhone/Safari and Android installed-app behavior, installation, safe-area/keyboard layout,
  offline startup, service-worker updates, and browser Back/Forward with unsaved edits.
- All external exercise/warm-up guide links. The incorrect bench-press link was verified and
  corrected; its reference-data update still needs a seed/deployment smoke check.
- Not-found, unauthorized/other-user, invalid-ID, loading and connection-error screens across
  routes, plus the development preview pages (overview, logging, headers, icons).
- A final browser smoke test against the production build; live deployment, real Supabase
  delivery/admin operations, and the external coach service have not been tested.

## Decisions still awaiting the user

- Should “Hold loads today” persist across leaving/reloading the workout?
- Should run summaries show up to two decimal places instead of rounding to one?
- When choosing a skipped day, reopen that cycle or explicitly offer its next cycle? Currently
  the picker says Cycle 1 while the action starts the next pending occurrence in Cycle 2.

## Open findings

- “Hold loads today” resets on leaving/reloading. Persistence preference requested.
- Old records already saved with an incorrect kg label cannot be distinguished from real kg
  records; no historical data was guessed or rewritten. Older coach plans do not contain a unit
  snapshot, so only newly saved plans can preserve that information.

The local fixtures and runtime are kept outside the commit, and the temporary build-directory
configuration is removed. The audit paused at the user's request for this commit checkpoint.
