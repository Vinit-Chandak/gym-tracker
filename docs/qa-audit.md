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

## Coach round: what was exercised and what changed

The coach itself ran three times against the running app, as the routine does: a nightly plan
for an athlete with nothing on record, a re-plan asked from Today at a second gym with a time
constraint, and a nightly plan after a session had been logged against the first. Each run was a
separate agent following `.claude/skills/coach/SKILL.md` with no knowledge of this audit, and
each was asked afterwards what the API, the scripts and the skill made hard. Their answers, and
the browser and API checks around them, produced the changes below.

Verified end to end: a nightly plan reaching Today and the session built from it (drops,
supersets, machine choices and set counts all carried into the logger); an on-demand re-plan
firing the routine, Today reporting it, and the page updating itself when the plan landed
minutes later; a plan made for another gym saying so instead of being used; the owner's daily
runs exhausted, a rejected routine token, an unexpected answer and a run that never reported,
each with its own message and the fifteen-minute reconciliation behind it; a programme
revision applied around an open session; warnings shown under a partial plan; the coach
switched off and on again with a plan waiting; and the read API's six endpoints, token expiry
options, real expiry, revocation, the ten-token cap, paging, date limits and per-account
isolation.

### Fixed

- Every workout session page threw a hydration error and repainted: Node's ICU and the
  browser's disagree about the comma after a short weekday, so the server wrote
  "Sat 12 Sept, 11:47" and the page "Sat, 12 Sept, 11:47". Weekday dates are now assembled from
  the formatter's parts, so both write the same words.
- One re-plan spent two of the athlete's three daily asks: the athlete's request and the coach's
  own record of the run were both counted. `coach_requests.initiated_by` now says who asked, and
  only the athlete's own asks count. Nothing the coach does of its own accord can spend one.
- An ask that never became a run — the owner's allowance gone, a routine that would not take the
  app's token — is given back. A run that started and then failed is still spent.
- Applying a programme change threw away the coach's plan for the day. The plan now moves onto
  the new version by slot lineage; only what the change itself rewrote follows the new
  programme, and a plan left with nothing to say is dropped as before.
- With a workout open, Today showed a plan that had landed after the session started rather than
  the one being trained.
- `lastPlans` could not support the rules built on it: the coach's own past plans came back as
  display names with no identifiers, and what was performed carried no RIR. They now carry the
  slot, its lineage, the exercise and the machine, and performances keep the RIR they were
  logged at.
- The coach could not tell a gym from the athlete's usual one, could not read the athlete's own
  words for a re-plan, and was handed a `reason: null` that means "nothing to plan" beside a
  perfectly good context. The context now marks the default gym, carries the athlete's ask, and
  sends `reason` only when there is nothing to plan.
- The coach had no idea when its next session or the athlete's next run fell. The context now
  says how many slots behind the programme is running and where the next running day is.
- `submit.ts` told the coach to retry a rejection no edit can fix; it now separates "fix these
  and submit again" from "this slot will not take a plan". The skill's own commands recorded a
  re-plan as a nightly run with no gym against it, and said nothing about closing the athlete's
  request when there was nothing to plan.
- Dismissing a proposed programme change lit up "Applying…" on the button beside it.
- A coach plan that deliberately leaves the load open said "the same load × 5" when nothing had
  ever been logged.
- The day's Start and Resume buttons answered to "Start Lower A" while showing "Start workout",
  so voice control could not reach them.
- A skipped exercise in a finished session read the same as one that was never done.
- Creating a second coach token while the first was still on screen left the button saying
  "Copied" for a token that had never been copied, and a clipboard that refused said nothing.
- An unexpected failure while asking the coach showed the athlete whatever the error said,
  database messages included.

### Fixed after the run-day round

A fourth coach run planned a day that both lifts and runs, and logging it end to end found
more:

- A day that runs could be answered with a plan that only covered the lifting. The server took
  it silently, and the athlete was told what to lift and left to guess the rest. It is refused
  now, unless that day's run has already been logged — the two halves are answered separately.
- `programme.nextRun` named the slot being planned when that day ran, which is the one thing
  the coach already knew. It names the run after it.
- A coach plan on a per-side slot showed "2 × 10" for what the programme writes as
  "2 × 10 per side": half the work. The plan line says per side now, and the skill says a
  per-side slot's numbers are what one side does.
- `lastPlans` was three versions of one day when a slot had been re-planned. It is the latest
  plan for each of the last three slots, and its prescribed sets are written the way
  performances are, in the unit they were planned in.
- The skill left `supersetGroup: null` ambiguous (it keeps the programme's grouping), did not
  say that `slot.runTarget.id` and `slot.programRunId` are the same row, and did not explain
  what `lastPlans[].status` means.

Also verified in the browser this round: a mixed day completed in run-first order, with the run
logged from the coach's own numbers and linked to the programme's planned run; a timed, per-side
prescription from plan to logged set; a free-weight set following the athlete's unit after a
mid-workout switch while machine work stayed in the machine's own unit and nothing already saved
was rewritten; skipping a day dropping the plan that waited for it; and the rest day's
"Start Lower A instead".

### Applying a programme change, once a mixed day had been trained

Trying a stale proposal in the browser turned up a defect that had nothing to do with the coach:
**applying any programme change failed for good once the athlete had completed a day that both
lifts and runs.** The two halves of such a day leave one event each, and the copy that carries an
athlete's position onto the new version dropped the `part` that tells them apart — so both
arrived as the session, collided on the slot's own uniqueness, and the whole revision was rolled
back. The athlete saw "Could not apply the change. Please retry.", and retrying could never
work. The run that answered the day was dropped from the copy as well, so history would have
lost what it pointed at. Both are carried now, and the case is covered.

### Noted, not changed

- `weightStep` resolves the machine's own increment before the exercise's, then 2.5 kg. A stack
  that moves in 5 kg steps cannot be asked for 2.5, so the machine wins on purpose.
- A free-weight exercise resolves as available at any gym unless the gym is marked as lacking
  the equipment, so "direct" is an assumption rather than a confirmation. The skill now says so.
- `src/domain/coach-cadence.ts` is groundwork for the weekly review in the AI-first plan and is
  not wired to anything yet.
- A plan may still be stored for a slot whose session is already open. It cannot be used by that
  session, and Today now shows the session's own plan, so it costs nothing; refusing it would
  also refuse a plan the athlete asked for before they started.

### Still only covered by tests, not the browser

- A coach plan that adds an exercise the programme's day does not have, logged end to end.
- A coach prescription measured in metres.
- Stale and conflicting proposals; a proposal that fails and is retried.

## Getting in: sign-up, the confirmation link, onboarding and a real password reset

Walked with the local auth stub, which delivers its "email" to a file so the links can be
opened. What the stub cannot stand in for is still listed under what remains.

### Fixed

- **The confirmation link signed nobody in.** It set the session on the host the athlete was
  on, then redirected to an absolute address built from the origin the server was started with.
  Where those differ — behind a proxy, on a custom domain, anywhere the app is not reached at
  its own internal address — the redirect arrived without the cookie, and confirming an email
  landed back on the sign-in screen. Both `nextUrl.origin` and `request.url` report the server's
  origin, so the route now redirects to a path and lets the browser resolve it.
- **The sign-up form emptied itself** whenever it refused: mistype one password and the name and
  address had to be typed again.
- **The profile step lost three answers on every refusal.** React clears the fields of a form
  whose action has run; the date of birth, the sex and the goal went with it, while the message
  on screen was about the body weight. All three are required, so the athlete had to notice and
  fill them in again. The fields are held in state and the reset is cancelled.

### Verified

Sign-up refuses an address that already has an account, an invalid address, a short password and
a mismatched pair, and reports the confirmation state; the profile trigger creates the row. An
unconfirmed address cannot sign in and says why. A link that was never issued, and one used
twice, both say so. The confirmation link lands a new account in setup. All four onboarding
steps: the profile step's validation, prefilling and resume; adding the first gym; ticking
machines from the list; taking the programme, which lands on Today with the first day ready.
Skipping ahead from the gym step finishes setup, and the empty account then reads correctly on
Today, History, Progress, Runs and Gyms. A password reset end to end: an unknown address gets
the same answer as a known one, a service that cannot send says so rather than claiming success,
the emailed link opens the new-password screen, the current password is refused as a new one,
and after the change the old password no longer signs in and the new one does.

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

## Decisions the user has since answered

- **Run decimals.** A single run now reads the distance that was logged, up to two decimals,
  wherever that one run appears; weekly and block totals keep their single decimal. The app had
  been inconsistent about this already — History showed 3.45 km where the run's own row showed
  3.5 — and one helper now answers for all of them. The coach reads the logged value too.
- **A skipped day, chosen again.** "Train another day" lists one cycle, so picking a day it
  shows as skipped now trains that occurrence: the skip is taken back rather than the day being
  passed over for the next cycle's, which the list never mentioned. A day already completed in
  the cycle shown still goes to its next occurrence.
- **An RPE given by mistake.** Pressing the chosen number again lets it go, since the rating is
  optional and a radio cannot uncheck itself.
- **Free-weight availability** stays as it is: an exercise is possible at a gym unless the gym
  is marked as lacking what it needs.
- **"Hold loads today"** is still open — see the note below.

## Open findings

- “Hold loads today” resets on leaving or reloading the workout, silently. Whether it should be
  remembered — or exist at all, given that it only changes what the prefill suggests — is with
  the user.
- Old records already saved with an incorrect kg label cannot be distinguished from real kg
  records; no historical data was guessed or rewritten. Older coach plans do not contain a unit
  snapshot, so only newly saved plans can preserve that information.

The local fixtures and runtime are kept outside the commit, and the temporary build-directory
configuration is removed. The audit paused at the user's request for this commit checkpoint.
