# Multisport, navigation and PWA audit — 22 September 2026

## Scope and baseline

The audited release is `origin/main` at **3fd542226f49906af2ff05c224a0e93ec7df847b**,
including the complete shipped multisport overhaul and the 22 September coaching fixes.
The audit branch is `codex/flow-audit-pwa`.

The requested five-day commit inventory covers 17 September 2026, 00:00 IST through
this main revision on 22 September. It contains **76 commits, including merges**, touching
**306 distinct paths**. The sixth-day context adds two commits from 16 September. Merge
commits and their constituent commits are both listed in the appendix; they are not counted
as separate product features. The feature inventory below describes what remains implemented
at the audited revision, including subsequent corrections and removal of rollout flags.

Review covered the changed feature implementations and their callers, route inventory,
database migrations and ownership boundaries, validation, browser state, offline persistence,
coaching transactions, shared projections, and the existing regression suite. Browser checks
cover the user-facing route families and representative populated, empty, pending, failed,
private and onboarding states. This is not a claim that every possible input combination or
every line of unchanged code has been independently proven correct.

## Features implemented in the commit window

| Feature group                      | Implemented behavior                                                                                                                                                | Representative commits                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Four-sport activity model          | Canonical activities for strength, running, cycling and swimming; sport-specific details, native units, unknown measurements, effort provenance and origin identity | 2b21eff, 24bb464, e3eb7ed                                     |
| Multisport database rollout        | Additive schema, ownership constraints/RLS, idempotent backfill of legacy workouts/runs, shared projections and deploy-time reconciliation                          | 24bb464, edb6050, 88c0492                                     |
| Training tab                       | Unified entry point for endurance logging, standalone scheduling, programme sessions and templates; strength keeps its dedicated logger                             | ba30ce9, 32d4e08                                              |
| Running logger                     | Outdoor/treadmill measurements, native distance, duration, heart rate, optional details and explicit effort                                                         | ba30ce9, 86ffe98, 6231cb4                                     |
| Cycling logger                     | Indoor/outdoor rides, optional distance, assistance, power, cadence, elevation and heart rate                                                                       | ba30ce9, e3eb7ed                                              |
| Swimming logger                    | Pool/open water, elapsed versus active time, manual distance or counted lengths, metre/yard pools, stroke and derived pace                                          | ba30ce9, 2b21eff                                              |
| Activity corrections and deletion  | Revision checks, retry receipts, ownership enforcement, transactional detail/projection updates and occurrence release on deletion                                  | e3eb7ed, 6b0b15f                                              |
| Scheduled sessions                 | Independent occurrence identity, pinned target revisions, skip/reopen/move, and explicit linking when logging a scheduled session                                   | e3eb7ed, ba30ce9, 6b0b15f                                     |
| Session templates                  | Saved sport prescriptions, simple targets and steps, revisioned editing and scheduling from a selected revision                                                     | ba30ce9                                                       |
| Sports preferences and onboarding  | Choose sports; hiding a shortcut retains history and programme commitments; non-strength onboarding can bypass gym setup                                            | ba30ce9, 680bbe6                                              |
| Canonical run reads                | History, running Progress, coach evidence and local seed data use the same canonical runs the logger writes; retired Runs tab redirects into Training               | 86df876, 16bd297, 5249548, 67ee377                            |
| Programme calendar                 | One programme clock; run identity belongs to a cycle day rather than only a weekday; strength/run parts of mixed days remain distinct                               | b8c08db, fa99d4e, 53bcdc8                                     |
| Effort scale                       | One 1–5 effort question, a real unknown answer, explicit reported provenance, consistent run labels and corrected data migrations                                   | 9ecab27, 86ffe98, 6231cb4, b6e3e65                            |
| Multisport totals and social reads | Per-sport totals/comparisons, null-aware distance and pace, cycling/swimming shared projections with explicit consent, and retained legacy API shapes               | 88c0492                                                       |
| Multisport coach                   | Contract v4, sport coverage rules, canonical training evidence, endurance session plans and validation against programme sports                                     | a313bf3, 5249548                                              |
| Coach requests                     | Notes become explicit requests with waiting, question, deferred, proposed and resolved states; athlete answers and withdrawals; reviews decide requests             | b421e5c, cd45791, 7670348                                     |
| Programme change review            | Before/after outline and operation-level changes, all linked request outcomes, one change per row, concise headline and approve/decline/revision paths              | b421e5c, cd45791, abf5436, 0f467ec                            |
| Manual reviews and gym changes     | Request a review, weekly allowance of five, plan for the current gym, and navigation back to today's requests                                                       | e90248f, a07acc7                                              |
| Review cadence                     | Anchor an enabled coach's review interval and evaluate not-yet-due reviews against the current day                                                                  | ec471f8, 4d9a5aa                                              |
| Coach reliability                  | Stale-clone preflight and self-repair, note parse consistency, and retrying failed jobs                                                                             | 68488bf, f021ff2, 151e5af, 3fd5422                            |
| Programme readback                 | Reading an approved running block back does not count as modifying it                                                                                               | 81b74b4                                                       |
| Coaching personalization           | Remove one person's shin-specific assumptions from generic onboarding; add a compact training reference                                                             | d07b1cf, 7666016                                              |
| Account lifecycle                  | Restore account deletion through the authenticated service path and cascading data removal                                                                          | dcd8e4f                                                       |
| Shared exercise library            | Add cable serratus punch                                                                                                                                            | 2ea1904                                                       |
| Mobile presentation                | Rename the second tab Training, use a legible Progress icon, correct mobile programme layout/time entry, simplify duplicated sport/effort questions                 | 1e63563, c343ba8, b8c08db, 9ecab27                            |
| Release documentation and cleanup  | Multisport plan, audit baseline and shipped-scope record; remove retired run helpers; P7/P8 rollout machinery was subsequently removed when all four sports shipped | b2d2ca0, 8da6687, ac9fab6, 7ee7052, 680bbe6, 915098d, ff5cfb3 |
| Sixth-day coaching context         | Answered notes, factual planning memory, practical progression and quiet-day cadence                                                                                | 9ce84ab                                                       |

## Findings fixed in this PR

| Finding                                                                                                | Resulting behavior                                                                                                                                                                                      | Verification                                                       |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Every header Back link used a fixed parent                                                             | Back uses the actual prior in-app browser entry, including query filters, reload and browser Back/Forward. Direct entry has a safe parent fallback; authentication/external pages are excluded          | Navigation unit tests and both browser engines                     |
| Cycling and swimming Edit routes returned Not found                                                    | All endurance sports open the correct editor and preserve entered units, details, outcome, resources and revision identity                                                                              | Create/edit flows on both engines, form-value tests                |
| Endurance draft storage existed without editor integration                                             | Edits persist locally per account, sport, activity and occurrence; restore after reload, retain the receipt key and original revision, clear only the acknowledged snapshot, and allow explicit discard | Offline/reload/retry and stale-edit browser flows; component tests |
| Malformed draft objects could reach the editor                                                         | Validate the full stored shape and ownership/key association; quarantine unreadable input with its raw text intact                                                                                      | Draft-storage regression cases                                     |
| A manually measured pool swim could lose its known pool size                                           | Preserve pool metadata during edits; switching to open water removes pool fields                                                                                                                        | Swimming form regression test                                      |
| Changing sport left old template choices or distance units                                             | Schedule choices filter by the current sport and reset an incompatible selection; template units follow the selected sport                                                                              | Sport-switching component and browser tests                        |
| Some mutations failed abruptly on disconnection                                                        | Scheduling, templates, sport selection, occurrence actions and deletion show retryable errors; an uncertain response does not falsely say nothing was saved                                             | Shared offline handling plus browser disconnect checks             |
| Privacy had no cycling/swimming sharing controls                                                       | Add explicit opt-in switches, accurate multisport disclosure and immediate projection removal on opt-out                                                                                                | UI tests, real database action test and browser/DB checks          |
| Re-enabling global sharing could omit rides/swims recorded while private                               | Rebuild currently opted-in projections from existing activities; deleted records stay deleted and unknown distance stays unknown                                                                        | Real database regression test                                      |
| A successful review without a draft said a draft was ready and suggested retrying                      | Show the completed/no-change outcome and rationale; reserve the draft link for an actual draft                                                                                                          | Coach status component tests and seeded job pages                  |
| Answer retries could silently reuse a note key for a different answer                                  | Lock the request, accept exact replays, reject mismatched keys, and generate a new key for a subsequent question                                                                                        | Repository and request UI regressions                              |
| Proposed requests could be withdrawn outside the proposal decision                                     | Restrict withdrawal to waiting, question and deferred states                                                                                                                                            | Repository lifecycle tests                                         |
| Invalid dates/times could normalize or fail late                                                       | Reject impossible scheduling dates/times; invalid Progress week links fall back with an explanation; malformed occurrence IDs fail safely                                                               | Validation/action regressions and browser checks                   |
| Install prompt listener mounted only after visiting Profile                                            | Capture the one-use browser event at the root and retain it across navigation; show Apple/manual installation guidance when appropriate                                                                 | Provider tests and cross-page browser install-event check          |
| Service worker cache writes and stable icon URLs needed correction                                     | Register at the root, keep cache writes alive, refresh stable icon URLs online, retain public offline guidance, and keep authenticated pages/API/actions out of caches                                  | Production manifest/cache/offline/reconnect checks                 |
| Floating navigation contrast failed automated WCAG checks                                              | Increase navigation surface opacity in light/dark themes                                                                                                                                                | Axe scans on Android light/dark                                    |
| Coach answer textareas lacked accessible names                                                         | Supply the existing semantic label when no associated label/ARIA name is present                                                                                                                        | Axe scans and answer-flow component tests                          |
| Onboarding/deletion copy lagged the multisport release                                                 | Remove the obsolete step count and refer to all activities when deleting an account                                                                                                                     | Screen review                                                      |
| Database audit treated canonical runs as orphaned shared rows and leaked owner scope across OR clauses | Recognize canonical activities and scope every legacy/canonical alternative to the requested owner                                                                                                      | Database audit regressions and clean local reconciliation          |
| Local audit could not be reproduced across all release states                                          | Add isolated setup, six-person seed, canonical multisport fixtures, production browser checks and meaningful failure exit codes                                                                         | Empty-database setup plus two repeated setup passes                |

## Local infrastructure and fixture coverage

The complete local stack runs PostgreSQL 17 on `127.0.0.1:5432`, the local GoTrue-compatible
auth stub on `127.0.0.1:54321`, and the production Next.js app at `http://localhost:3100`.
The audit runner explicitly overrides database/auth/service settings and disables external
coach dispatch. It rejects non-loopback databases and names outside `overload_audit` plus
optional suffixes. Hosted data and the normal `overload_dev` database were not modified.

| Account (all `@local.test`) | Seeded role                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `vinit`                     | Established metric athlete, mixed programme, shared history, coach proposal/questions/notes and friends                   |
| `shreyash`                  | Strength emphasis, narrower enabled shortcuts, shared comparative data and a separate coach decision                      |
| `priya`                     | Running emphasis, body-weight privacy and pending social/coaching states                                                  |
| `alex`                      | Pounds and America/New_York, private training, active ad hoc strength session with reps/hold/carry and multisport records |
| `sam`                       | Onboarded empty account for no-history/no-programme states                                                                |
| `taylor`                    | New account for the onboarding flow                                                                                       |

All six use **`password123`**, only in this local auth stub. A seventh disposable local account
was created through Signup to verify password change, sign-in and deletion; it was then deleted.

A fresh rehearsal database contained **6 users, 20 gyms, 276 exercises, 286 equipment rows,
29 workouts, 56 canonical activities, 100 occurrences, 12 endurance templates, 3 coaching
drafts, 9 jobs and 51 shared session rows**. Canonical activities comprised 29 strength,
11 running, 8 cycling and 8 swimming records. The retired `runs` table was empty, intentionally.
Two repeated setup passes kept these counts stable. The working audit database contains
additional records and state changes from exercising the UI; rerunning setup does not reset
those decisions or duplicate the seed.

Reproduce from the repository root with local PostgreSQL running and Node/npm installed:

```sh
npm ci
npx playwright install chromium webkit
npm run audit:setup
npm run audit:build
```

Keep `npm run audit:auth` and `npm run audit:start` running in two terminals, then:

```sh
npm run audit:screens
npm run audit:flows
npm run audit:db
npm test
npm run lint
```

`AUDIT_DATABASE_URL` can select another loopback database named, for example,
`overload_audit_rehearsal`. Set it consistently for setup, auth, build/start and flow checks.
`AUDIT_PORT` controls the app port; use the matching `AUDIT_BASE_URL` for browser checks.
Flows default to Android; set `AUDIT_DEVICE=iphone` for the WebKit pass (`$env:AUDIT_DEVICE = "iphone"`
in PowerShell, then run `npm run audit:flows`). `AUDIT_DEVICE` selects `android` or `iphone` for flows and also `narrow` or `desktop` for
screens. `AUDIT_THEME=dark` and `AUDIT_ROUTE_FILTER` allow focused screen rechecks.
Screen/flow checks use the most recent fixture manifest in `output/flow-audit/fixtures.json`.
Browser flows deliberately create local records and mutate their own new test fixtures.

## Screen and logical-flow coverage

| Area                          | Executed checks                                                                                                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication and onboarding | Login, signup, empty/invalid recovery pages, full profile → sports → gym → equipment → programme onboarding, skip programme, password change and account deletion                      |
| Today and strength            | Programme choice, recovery check-in, start session, exercise substitution, ad hoc logging, reps/hold/carry inputs, pounds, offline set retry/reload, finish with notes and body weight |
| Endurance logging             | Run/ride/swim create, required effort, unknown versus zero distance, native yard pools, edit restoration, concurrent edit rejection and account ownership                              |
| Scheduling and templates      | Change sport and units, create/edit template, pin revisions, preserve existing targets, skip/reopen/reschedule, ad hoc versus linked completion and delete/re-log                      |
| Navigation                    | History filter → activity → editor → reload → Back → Back → browser Forward; direct-link fallback; nested header coverage                                                              |
| Programme and coach           | Programme outline and Changes, manual/intake pages, ready/no-change/failed jobs, proposal approve/decline/revision, question answer and withdrawal, onboarding aliases                 |
| History and Progress          | Populated and empty history, canonical run visibility, body-weight and running views, bad week links, per-sport programme filters                                                      |
| Gyms and exercises            | Lists/details, create/edit forms, equipment, gym programme and exercise fallback picker; actual gym/equipment creation during onboarding and substitution during a workout             |
| Social and privacy            | Friends/requests, profile/compare/exercise comparison, per-sport leaderboards and shared ride detail, private profile, sport shortcut persistence and sharing switches                 |
| PWA                           | Production manifest/icons, root registration, cross-page install event, standalone/manual guidance paths, cache boundary, offline navigation and reconnect                             |
| Viewports                     | Android Chromium/Pixel 7, iPhone WebKit/iPhone 13, narrow 320 px, desktop 1440 px and targeted Android dark-mode screens                                                               |

The automated flow harness passed **20 scenarios on Android and the same 20 on iPhone**.
The broad screen scans recorded **487 successful page-state observations**: Android 113,
iPhone 115, narrow 113, desktop 113 and dark Android 33. No remaining JavaScript page errors,
horizontal page overflow or Axe WCAG A/AA findings were reported in those scans. Accessibility
automation ran on the Android light/dark scans; it does not replace assistive-technology testing.
Later focused checks cover the final privacy and coach-status changes.

The five `/preview/*` routes correctly return Not found in the production build because their
layout explicitly restricts them to development. Legacy `/runs/*` routes and onboarding
programme aliases were checked as compatibility paths. Some onboarding routes intentionally
redirect after a prerequisite or onboarding itself has been completed; the actual onboarding
sequence was separately exercised with the new account.

WebKit's emulated offline switch did not consistently simulate a failed navigation. Its
offline-navigation check therefore uses a temporary loopback proxy with the connection
actually interrupted. A separate manual test stopped a local app server entirely and received
the cached offline page. Offline draft restoration was also exercised in WebKit.

## Evidence and remaining release checks

The full Vitest suite passed **1,217 tests in 164 files**. The production build, TypeScript
checking, ESLint and Prettier passed. Text line endings are pinned to LF for consistent
Windows/Unix formatting checks. Multisport database reconciliation and programme
schedule invariants reported no findings. The final coach-status narrowing change also
passed its targeted component tests after the full run.

The committed scripts and regression tests reproduce the checks. Local screenshots, fixture
IDs, browser observations and command logs are retained under `output/flow-audit/` and
`output/audit-*.txt`, which are ignored by Git. Useful files include `screens-*.json`,
`flows-android.json`, `flows-iphone.json`, `manual-flows.json`, `alias-previews.json`,
`audit-tests-final.txt`, `audit-build-final.txt`, `audit-lint-final.txt` and
`audit-db-invariants.txt`. They contain local synthetic account data, not production records.

This PWA retains unsent strength-set and endurance-activity input locally and provides an
offline fallback for navigation. Loading authenticated pages and committing writes still
requires a connection. It does **not** implement a fully offline programme/workout engine or
background synchronization of every mutation. Private responses are not put in service-worker
caches. Draft storage is scoped by account, but signing out does not currently erase a user's
unsent activity drafts from the device.

The local auth stub does not send confirmation/recovery email or reproduce hosted auth rate
limits. Live model/worker dispatch was disabled; seeded outcomes, application transactions,
contract validation and regression tests exercise coaching behavior without claiming a live
AI run. Physical Android/iPhone home-screen installation, OS-specific keyboards, safe-area
behavior on hardware, and device suspension/storage eviction still need a device release pass.

The previously documented shipped route/API differences in
[MULTISPORT_AUDIT_SCOPE.md](../planning/MULTISPORT_AUDIT_SCOPE.md) remain deliberate:
Changes/routine editors and programme creation aliases retain their current routes, and the
legacy API compatibility shape remains. This audit did not reintroduce the removed rollout
flags or invent a compatibility expiry policy.

## Commit appendix

The following entries are all commits reachable from the audited main revision within the
specified window, ordered newest first. Subjects and original commit timestamps are retained.

| Commit                                                                 | Timestamp                 | Change                                                                                      |
| ---------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------- |
| [3fd5422](https://github.com/Vinit-Chandak/gym-tracker/commit/3fd5422) | 2026-09-22T11:16:28+05:30 | A failed coaching job can be sent back for another try (#65)                                |
| [4d9a5aa](https://github.com/Vinit-Chandak/gym-tracker/commit/4d9a5aa) | 2026-09-22T11:10:28+05:30 | A review the cadence has not come due for is read against today's clock (#66)               |
| [81b74b4](https://github.com/Vinit-Chandak/gym-tracker/commit/81b74b4) | 2026-09-22T09:41:15+05:30 | An approved running block read back is not an edit to it (#64)                              |
| [b6e3e65](https://github.com/Vinit-Chandak/gym-tracker/commit/b6e3e65) | 2026-09-22T01:13:12+05:30 | A rescale and an ALTER cannot share a transaction uninvited (#62)                           |
| [6231cb4](https://github.com/Vinit-Chandak/gym-tracker/commit/6231cb4) | 2026-09-22T00:59:25+05:30 | Runs say Effort too, and a test run means what it says (#61)                                |
| [86ffe98](https://github.com/Vinit-Chandak/gym-tracker/commit/86ffe98) | 2026-09-22T00:41:14+05:30 | Effort is asked for out of five, and asked for once (#58)                                   |
| [67ee377](https://github.com/Vinit-Chandak/gym-tracker/commit/67ee377) | 2026-09-22T00:20:48+05:30 | Runs are read where runs are written (#59)                                                  |
| [5249548](https://github.com/Vinit-Chandak/gym-tracker/commit/5249548) | 2026-09-21T18:45:15+00:00 | The coach reads the runs, and the retired Runs tab goes                                     |
| [16bd297](https://github.com/Vinit-Chandak/gym-tracker/commit/16bd297) | 2026-09-21T15:06:39+00:00 | Seed the runs the app would actually have written                                           |
| [86df876](https://github.com/Vinit-Chandak/gym-tracker/commit/86df876) | 2026-09-21T14:56:01+00:00 | A run you logged is a run History and Progress can see                                      |
| [53bcdc8](https://github.com/Vinit-Chandak/gym-tracker/commit/53bcdc8) | 2026-09-21T11:06:12+05:30 | A run belongs to a day of the cycle, not to a weekday (#57)                                 |
| [fa99d4e](https://github.com/Vinit-Chandak/gym-tracker/commit/fa99d4e) | 2026-09-21T05:31:38+00:00 | A run belongs to a day of the cycle, not to a weekday                                       |
| [00551ef](https://github.com/Vinit-Chandak/gym-tracker/commit/00551ef) | 2026-09-21T00:45:27+05:30 | Add the cable serratus punch to the shared library (#56)                                    |
| [2ea1904](https://github.com/Vinit-Chandak/gym-tracker/commit/2ea1904) | 2026-09-20T19:12:31+00:00 | Add the cable serratus punch to the shared library                                          |
| [6b7250b](https://github.com/Vinit-Chandak/gym-tracker/commit/6b7250b) | 2026-09-20T18:32:18+05:30 | Let an account be deleted again (#55)                                                       |
| [dcd8e4f](https://github.com/Vinit-Chandak/gym-tracker/commit/dcd8e4f) | 2026-09-20T13:01:53+00:00 | Let an account be deleted again                                                             |
| [3ed0e2a](https://github.com/Vinit-Chandak/gym-tracker/commit/3ed0e2a) | 2026-09-20T15:44:28+05:30 | Five reviews a week, a re-plan for the gym you are on, and a way back to today's asks (#54) |
| [a07acc7](https://github.com/Vinit-Chandak/gym-tracker/commit/a07acc7) | 2026-09-20T10:13:57+00:00 | Five reviews a week, a re-plan for the gym you are on, and a way back to today's asks       |
| [32d4e08](https://github.com/Vinit-Chandak/gym-tracker/commit/32d4e08) | 2026-09-20T15:22:16+05:30 | Call the second tab what it is called on the icon preview (#53)                             |
| [1e63563](https://github.com/Vinit-Chandak/gym-tracker/commit/1e63563) | 2026-09-20T09:51:55+00:00 | Call the second tab what it is called on the icon preview                                   |
| [21c9502](https://github.com/Vinit-Chandak/gym-tracker/commit/21c9502) | 2026-09-20T15:20:20+05:30 | Progress gets bars, which survive the size the tab draws them at (#52)                      |
| [c949841](https://github.com/Vinit-Chandak/gym-tracker/commit/c949841) | 2026-09-20T09:40:23+00:00 | Merge remote-tracking branch 'origin/main' into claude/ui-issues-layout-selector-t55e0t     |
| [c343ba8](https://github.com/Vinit-Chandak/gym-tracker/commit/c343ba8) | 2026-09-20T09:40:16+00:00 | Progress gets bars, which survive the size the tab draws them at                            |
| [ebfa3f5](https://github.com/Vinit-Chandak/gym-tracker/commit/ebfa3f5) | 2026-09-20T15:05:16+05:30 | Stop calling a logged effort a copied one, and ask the sport once (#51)                     |
| [9ecab27](https://github.com/Vinit-Chandak/gym-tracker/commit/9ecab27) | 2026-09-20T09:34:52+00:00 | Stop calling a logged effort a copied one, and ask the sport once                           |
| [d2bd368](https://github.com/Vinit-Chandak/gym-tracker/commit/d2bd368) | 2026-09-20T14:01:26+05:30 | Take out what the run half stopped needing (#50)                                            |
| [ef9aa28](https://github.com/Vinit-Chandak/gym-tracker/commit/ef9aa28) | 2026-09-20T13:59:26+05:30 | Let the coach routine fix its own stale clone (#49)                                         |
| [151e5af](https://github.com/Vinit-Chandak/gym-tracker/commit/151e5af) | 2026-09-20T08:29:07+00:00 | Let the coach routine fix its own stale clone                                               |
| [587abc1](https://github.com/Vinit-Chandak/gym-tracker/commit/587abc1) | 2026-09-20T08:21:25+00:00 | Merge remote-tracking branch 'origin/main' into claude/ui-issues-layout-selector-t55e0t     |
| [ff5cfb3](https://github.com/Vinit-Chandak/gym-tracker/commit/ff5cfb3) | 2026-09-20T08:20:51+00:00 | Take out what the run half stopped needing                                                  |
| [97ca1c6](https://github.com/Vinit-Chandak/gym-tracker/commit/97ca1c6) | 2026-09-20T13:49:52+05:30 | Say what a change does, once, in a line (#48)                                               |
| [0f467ec](https://github.com/Vinit-Chandak/gym-tracker/commit/0f467ec) | 2026-09-20T08:18:32+00:00 | Say what a change does, once, in a line                                                     |
| [d8f2e8a](https://github.com/Vinit-Chandak/gym-tracker/commit/d8f2e8a) | 2026-09-20T13:37:56+05:30 | One programme, one clock, and three things that looked wrong on a phone (#47)               |
| [851e851](https://github.com/Vinit-Chandak/gym-tracker/commit/851e851) | 2026-09-20T07:57:23+00:00 | Merge remote-tracking branch 'origin/main' into claude/ui-issues-layout-selector-t55e0t     |
| [b8c08db](https://github.com/Vinit-Chandak/gym-tracker/commit/b8c08db) | 2026-09-20T07:56:26+00:00 | One programme, one clock, and three things that looked wrong on a phone                     |
| [ce3f57f](https://github.com/Vinit-Chandak/gym-tracker/commit/ce3f57f) | 2026-09-20T13:18:17+05:30 | One change, one row on the Changes tab (#46)                                                |
| [abf5436](https://github.com/Vinit-Chandak/gym-tracker/commit/abf5436) | 2026-09-20T07:45:39+00:00 | One change, one row on the Changes tab                                                      |
| [9c1a552](https://github.com/Vinit-Chandak/gym-tracker/commit/9c1a552) | 2026-09-20T10:47:20+05:30 | Merge pull request #45 from Vinit-Chandak/claude/epic-carson-8uuwbz                         |
| [6b0b15f](https://github.com/Vinit-Chandak/gym-tracker/commit/6b0b15f) | 2026-09-20T04:58:47+00:00 | Audit the multisport release: seven things it got wrong                                     |
| [915098d](https://github.com/Vinit-Chandak/gym-tracker/commit/915098d) | 2026-09-20T09:40:03+05:30 | Record what the multisport release actually shipped (#44)                                   |
| [ec471f8](https://github.com/Vinit-Chandak/gym-tracker/commit/ec471f8) | 2026-09-20T09:17:24+05:30 | A coach that is on has a review interval (#43)                                              |
| [edb6050](https://github.com/Vinit-Chandak/gym-tracker/commit/edb6050) | 2026-09-20T08:54:38+05:30 | Run the multisport backfill as part of the deploy (#42)                                     |
| [680bbe6](https://github.com/Vinit-Chandak/gym-tracker/commit/680bbe6) | 2026-09-20T03:22:20+05:30 | Remove the multisport rollout flags and ship all four sports (#41)                          |
| [68e3c4d](https://github.com/Vinit-Chandak/gym-tracker/commit/68e3c4d) | 2026-09-20T02:46:44+05:30 | Merge pull request #40 from Vinit-Chandak/codex/coaching-review-improvement-plan            |
| [7ee7052](https://github.com/Vinit-Chandak/gym-tracker/commit/7ee7052) | 2026-09-19T20:21:20+00:00 | P8: a contraction that argues back                                                          |
| [ac9fab6](https://github.com/Vinit-Chandak/gym-tracker/commit/ac9fab6) | 2026-09-19T20:11:25+00:00 | P7: the order, rehearsed rather than written down                                           |
| [88c0492](https://github.com/Vinit-Chandak/gym-tracker/commit/88c0492) | 2026-09-19T20:02:46+00:00 | P6: totals that are totals, and a v1 that stays v1                                          |
| [a313bf3](https://github.com/Vinit-Chandak/gym-tracker/commit/a313bf3) | 2026-09-19T19:27:16+00:00 | P5: a coach that knows what a swim is                                                       |
| [5648ae2](https://github.com/Vinit-Chandak/gym-tracker/commit/5648ae2) | 2026-09-19T18:38:14+00:00 | A "use server" module exports async functions and nothing else                              |
| [917cc33](https://github.com/Vinit-Chandak/gym-tracker/commit/917cc33) | 2026-09-19T18:27:08+00:00 | Correct the file count after P0                                                             |
| [3d1257c](https://github.com/Vinit-Chandak/gym-tracker/commit/3d1257c) | 2026-09-19T18:26:29+00:00 | Take out the three helpers nothing calls                                                    |
| [cda6ca0](https://github.com/Vinit-Chandak/gym-tracker/commit/cda6ca0) | 2026-09-19T18:20:36+00:00 | Record what each phase left behind, and which switch turns it on                            |
| [ba30ce9](https://github.com/Vinit-Chandak/gym-tracker/commit/ba30ce9) | 2026-09-19T18:20:02+00:00 | P4: one place to train, whatever the sport                                                  |
| [e3eb7ed](https://github.com/Vinit-Chandak/gym-tracker/commit/e3eb7ed) | 2026-09-19T17:50:53+00:00 | P3: one boundary for saving, correcting and deleting an activity                            |
| [24bb464](https://github.com/Vinit-Chandak/gym-tracker/commit/24bb464) | 2026-09-19T17:28:14+00:00 | P2: room for four sports, and a backfill that can be run twice                              |
| [2b21eff](https://github.com/Vinit-Chandak/gym-tracker/commit/2b21eff) | 2026-09-19T17:03:09+00:00 | P1: say what an activity, a measurement and a plan are                                      |
| [8da6687](https://github.com/Vinit-Chandak/gym-tracker/commit/8da6687) | 2026-09-19T16:48:19+00:00 | P0: know what is there before changing any of it                                            |
| [a0d45d1](https://github.com/Vinit-Chandak/gym-tracker/commit/a0d45d1) | 2026-09-19T22:04:47+05:30 | Merge main into codex/coaching-review-improvement-plan                                      |
| [b2d2ca0](https://github.com/Vinit-Chandak/gym-tracker/commit/b2d2ca0) | 2026-09-19T22:02:01+05:30 | docs: plan Overload multisport overhaul                                                     |
| [3483229](https://github.com/Vinit-Chandak/gym-tracker/commit/3483229) | 2026-09-19T19:31:51+05:30 | Merge pull request #37 from Vinit-Chandak/claude/epic-carson-8uuwbz                         |
| [e90248f](https://github.com/Vinit-Chandak/gym-tracker/commit/e90248f) | 2026-09-19T13:46:07+00:00 | Ask for a review, rather than waiting for one                                               |
| [d07b1cf](https://github.com/Vinit-Chandak/gym-tracker/commit/d07b1cf) | 2026-09-19T13:45:56+00:00 | Stop asking everybody about one person's shins                                              |
| [f12f450](https://github.com/Vinit-Chandak/gym-tracker/commit/f12f450) | 2026-09-19T18:08:18+05:30 | Merge pull request #36 from Vinit-Chandak/claude/epic-carson-8uuwbz                         |
| [7670348](https://github.com/Vinit-Chandak/gym-tracker/commit/7670348) | 2026-09-19T12:13:22+00:00 | Only the review decides an ask, and the change shows all of them                            |
| [6ead136](https://github.com/Vinit-Chandak/gym-tracker/commit/6ead136) | 2026-09-19T17:02:25+05:30 | Merge pull request #35 from Vinit-Chandak/claude/fix-0024-backfill-cast                     |
| [c3151b9](https://github.com/Vinit-Chandak/gym-tracker/commit/c3151b9) | 2026-09-19T11:32:07+00:00 | A guard beside a cast is not a guard before it                                              |
| [4260eac](https://github.com/Vinit-Chandak/gym-tracker/commit/4260eac) | 2026-09-19T16:52:16+05:30 | Merge pull request #34 from Vinit-Chandak/codex/coaching-review-improvement-plan            |
| [cd45791](https://github.com/Vinit-Chandak/gym-tracker/commit/cd45791) | 2026-09-19T11:06:51+00:00 | An outline says which side is which, and only the daily run decides                         |
| [b421e5c](https://github.com/Vinit-Chandak/gym-tracker/commit/b421e5c) | 2026-09-19T10:52:13+00:00 | Say what changed, and answer what was asked                                                 |
| [7666016](https://github.com/Vinit-Chandak/gym-tracker/commit/7666016) | 2026-09-19T15:01:14+05:30 | docs: add compact coach training reference and integration proposal                         |
| [6fc981f](https://github.com/Vinit-Chandak/gym-tracker/commit/6fc981f) | 2026-09-19T14:01:47+05:30 | docs: plan coaching requests and programme review diffs                                     |
| [ad8feca](https://github.com/Vinit-Chandak/gym-tracker/commit/ad8feca) | 2026-09-18T09:18:25+05:30 | Merge pull request #33 from Vinit-Chandak/claude/issue-diagnosis-3fzx50                     |
| [f021ff2](https://github.com/Vinit-Chandak/gym-tracker/commit/f021ff2) | 2026-09-18T03:35:16+00:00 | Let a note close: stop renaming the field between two parses                                |
| [b4a90ed](https://github.com/Vinit-Chandak/gym-tracker/commit/b4a90ed) | 2026-09-18T08:35:22+05:30 | Merge pull request #32 from Vinit-Chandak/claude/issue-diagnosis-3fzx50                     |
| [1fc43f5](https://github.com/Vinit-Chandak/gym-tracker/commit/1fc43f5) | 2026-09-18T03:04:28+00:00 | Say that the routine prompt must not pin a revision                                         |
| [68488bf](https://github.com/Vinit-Chandak/gym-tracker/commit/68488bf) | 2026-09-18T02:56:14+00:00 | Stop a stale routine clone before it spends an attempt                                      |

### Sixth-day context: 16 September

| Commit                                                                 | Timestamp                 | Change                                                                         |
| ---------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------ |
| [56d480e](https://github.com/Vinit-Chandak/gym-tracker/commit/56d480e) | 2026-09-16T12:39:12+05:30 | Merge pull request #31 from Vinit-Chandak/claude/ai-coach-planning-memo-4zhn0i |
| [9ce84ab](https://github.com/Vinit-Chandak/gym-tracker/commit/9ce84ab) | 2026-09-16T07:06:34+00:00 | Notes that get answered, a memo that states facts, and steps that can be taken |
