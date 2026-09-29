# Comprehensive local and mobile audit — 29–30 September 2026

Branch: `codex/comprehensive-mobile-audit-2026-09-29`, created from fetched `origin/main`
at `42c64ca`. This is a new audit checkpoint; the
[26 September report](2026-09-26-comprehensive-audit.md) is preserved separately.

**Audit passed.** The complete 26-job browser/database matrix passed: 1,078 screen visits,
266 workflow checks, 244 monthly history windows and 20 filter checks. The final application
source passed 1,857 tests across 230 files, all static checks and the production build. A
24-persona coach simulation also passed after exposing and verifying a further guardrail fix;
programme workflows and database checks were repeated against that final build. The exact
source revisions and evidence for each validation stage are recorded below. No unresolved
failures remain in these checks; physical-device and external-service limits are listed at the end.

## Local infrastructure and fixture baseline

The audit uses an isolated PostgreSQL database, a Supabase-compatible local auth stand-in,
the actual application migrations and a separate production Next.js build. The setup and
commands are documented in [Reproducing the 56-month local audit](local-56-months.md).

| Component                            | Location                                                      |
| ------------------------------------ | ------------------------------------------------------------- |
| Application                          | `http://localhost:3102`                                       |
| Local authentication                 | `http://127.0.0.1:54324`                                      |
| PostgreSQL                           | `127.0.0.1:5432`, database `overload_audit_20260929`          |
| Production build                     | `.next-audit`, using `tsconfig.audit.json`                    |
| Reports, screenshots and fixture IDs | `output/audit-2026-09-29/`                                    |
| Seed window                          | 1 February 2022 through 29 September 2026, 56 calendar months |

Six seeded users cover metric and imperial preferences, public and private sharing, accepted
and pending followers, established history, an unfinished workout, an empty account and
incomplete onboarding. Their usernames are `vinit`, `shreyash`, `priya`, `alex`, `sam` and
`taylor`; local sign-in uses `<username>@local.test` and `password123`.
These persona states describe the fresh seed. Sam now has intentional records from the
mutation workflows; a fresh replay database restores the pristine empty-account state.

The before/after checks record the fresh fixture baseline and the state after the completed
browser workflows. The changed counts reflect those workflows; disposable test accounts were
removed and all six seeded users remain.

| Record                                  | Before workflows | After workflows |
| --------------------------------------- | ---------------: | --------------: |
| Users                                   |                6 |               6 |
| Canonical activities                    |            3,315 |           3,325 |
| Strength sessions                       |            1,597 |           1,597 |
| Sets                                    |           14,488 |          14,488 |
| Food entries                            |           20,760 |          20,768 |
| Body-weight readings                    |            1,123 |           1,123 |
| Standalone recovery readings            |            1,120 |           1,120 |
| Bike, pool, trainer and venue resources |               20 |              20 |
| Saved meals                             |                4 |               6 |
| Scheduled occurrences                   |              100 |             102 |

Four established users have all four sports and food, weight and recovery data across the
56-month window. Fixtures include zero versus unknown distance, yards versus metres, mixed
workout measurements, partial recovery answers, long labels, archived resources, programme
proposals and coaching job states. The seed records its anchor and completed account-months,
so repeating setup preserves subsequent interactions and avoids duplicated history.

Database and browser scripts enforce loopback audit targets. Existing `.env` files and ordinary
development builds are kept separate. External coach dispatch is disabled for this stack.

## Screen and workflow coverage

The current route list was compared with `.next-audit/server/app-paths-manifest.json`:
**all 80 application page templates have a corresponding route case**. This inventory excludes
six design-preview pages and the framework's error/not-found page entries. APIs, authentication
callbacks and generated icon/manifest routes are separate from page-template coverage. The
inventory is saved in `output/audit-2026-09-29/route-inventory.json`.

The screen sweeps include these surfaces:

- Sign-in, sign-up, password recovery and every onboarding stage.
- Today, day choice, active and completed workouts, check-in, finish, adding and substituting
  exercises, plus legacy run redirects.
- Running, cycling and swimming logs, corrections, templates, scheduled sessions and programme
  occurrences; both populated and empty training states.
- Food, all seven meals, targets, My foods and saved meal creation/editing.
- Progress, history, recovery, body measurements and charts, with supported yearly windows
  covering the complete seeded history.
- Profile, sports, privacy, password/deletion, gyms, equipment and exercise details.
- Programme creation, manual editing, drafts, proposal previews, coaching jobs and routines.
- People search, followers, public/private profiles, comparisons and leaderboards.

`npm run audit:all` orchestrates 26 jobs and writes `suite-results.json` plus `suite-logs/`.
Read-only screen sweeps run two at a time; mutation suites run sequentially. Its screen matrix
comprises Android Chromium, iPhone WebKit, a 320 px phone
layout, desktop, Android dark, narrow light at 200% text with disclosures expanded, and iPhone
dark at 200% text with disclosures expanded. Android scans include Axe accessibility checks.
Each page visit records its status, destination, browser errors, horizontal overflow and
screenshot; a route existing in the inventory does not substitute for a successful visit.

The completed expanded sweep contains **154 visits per configuration, 1,078 total**, with no
failed visits. Four extra cases
open populated Food, Breakfast, Lunch and Dinner at `fixtures.history.to`, so a later run still
tests seeded nutrition data after the calendar advances. All seven reports contain zero
uncaught page errors, document overflow, unexpected destinations or unexpected not-found pages;
the Android Axe scans report no violations for their configured rule set.

The following workflow totals combine Chromium and WebKit. Every listed check passed; the
history and database checks are counted separately in the verification record.

| Workflow suite        |      Passed | Verified behaviors                                                                                           |
| --------------------- | ----------: | ------------------------------------------------------------------------------------------------------------ |
| `audit:account`       |       20/20 | Signup, onboarding, units, gyms/equipment, privacy, follows, password changes and deletion                   |
| `audit:programme`     |       18/18 | Custom exercises, drafts, ordering, reload, activation, proposal decisions and saved routines                |
| `audit:bookmarks`     |         8/8 | Sign-in return destinations for legacy and scheduled links                                                   |
| `audit:legacy-routes` |       50/50 | HTTP 307 redirects, repeated navigation, exact ownership, unavailable links, 404s and onboarding             |
| `audit:workout`       |       22/22 | Saved sets, drafts, retries, state changes, completion and retained measurements                             |
| `audit:flows`         |       40/40 | Endurance logs/corrections, stale edits, scheduling, deletion, privacy and PWA behavior                      |
| `audit:recovery`      |       24/24 | Complete/partial check-ins, corrections, charts and date navigation                                          |
| `audit:food`          |       36/36 | Foods, saved meals, targets, history, retry, account isolation and responsive sheets                         |
| `audit:quick-food`    |         8/8 | Optional names, validation, past dates, lost-response retries and portion correction/removal                 |
| `audit:ui-controls`   |       26/26 | Native controls, help, charts, enlarged text, readable rows, calendar geometry, appearance and touch targets |
| `audit:activity-time` |       14/14 | DST gaps/repeated hours, exact UTC persistence, time-zone changes and corrections                            |
| **Total**             | **266/266** | **No failed workflow checks**                                                                                |

The aggregate runs its write suites sequentially because some use the same empty persona.
Account/programme scenarios, quick-food and activity-time use disposable accounts where possible.
The broader food suite resets Sam's nutrition fixtures; a fresh replay database is needed for
another pristine baseline.

## Application fixes

### Data and client flows

- **Activity drafts crossing sessions:** navigating within the activity route could reuse the
  prior sport's retry key or the prior scheduled session's measurements and occurrence link.
  The editor now resets on account/sport/activity/occurrence identity changes while retaining
  the pinned revision and local draft through refreshes of that same activity.
- **Running targets changed by unrelated programme days:** editing or deleting a rest/lifting
  day could rewrite another day's running targets simply because its weekday matched. The
  builder now reconciles targets only for running days and keeps one target per week/weekday.
  Repeated weekdays preserve shared targets when a day is moved, removed or the duration changes.
- **Stale following controls:** accepted requests arriving through refreshed server data left
  the button labelled Requested and could leave an obsolete cancellation sheet open. The
  control now follows the new relationship state. A delayed response or network error from an
  older action cannot overwrite a more recent server relationship update.
- **Swimming heart rates lost on save:** average and maximum heart rates were accepted by the
  form but omitted from swimming detail writes. They now persist through creation, correction
  and clearing.
- **Activity dates moving after travel:** correcting an activity after a profile time-zone
  change could change its date and instant. Corrections now use the activity's recorded zone,
  expose that zone on the form, and preserve the exact original instant and date when its
  displayed time is unchanged.
- **Invalid or future activity times:** impossible calendar dates, overflowing time fields and
  nonexistent daylight-saving times are rejected without silently normalizing them. Future
  actuals beyond the existing five-minute clock tolerance receive field feedback.
- **Cancelled programme sessions revived:** stale skip, reopen, move or claim operations could
  act on cancelled occurrences. Those states are now refused, cancelled detail pages explain
  their status, and repeated skip/reopen/move requests do not create duplicate lifecycle events
  or revisions.
- **Saved meal indexes referring to different foods:** an editor retained foods by position,
  so another edit or a replay after a lost response could resolve those positions against a
  different snapshot. Editors pin the saved version; stale versions are refused, updates advance
  their timestamps, and edit submissions now use receipts to make identical retries harmless.
  Existing-meal updates require a version, so omitting it cannot bypass the stale-edit check.
- **Legacy redirects rendering navigation before resolving:** old run links could stream the
  main app shell while their owner lookup was pending. Its navigation prefetches could then be
  abandoned by the redirect and produce intermittent WebKit errors. Compatibility pages now
  live in a bare route group without loading/Suspense boundaries or tab navigation. They check
  onboarding and ownership before returning an actual HTTP 307 redirect. Existing URLs,
  metadata, exact identifier mappings, unavailable-link messages and useful 404s are preserved;
  the main application shell is unchanged.

### Mobile layout and controls

- The onboarding programme chooser now has a visible page heading. The final screen sweep
  caught this missing heading; the correction also gives screen-reader heading navigation a
  clear starting point.
- Help notes are positioned inside the visual viewport rather than clipped by scrolling cards.
  They remain inside a native modal when opened there, can scroll at enlarged text sizes, and
  restore focus to their trigger on Escape.
- Chart selections now track the observation date instead of an array index that could become
  invalid when filters replace the series. Tooltip width and wrapping stay within the chart.
- Headers preserve enough width for titles before moving metadata or actions to another line.
  Shared link and settings rows group their icon and label, and move secondary content below
  before squeezing words into narrow columns at 320 px and 200% text. The workout Resume action
  now has a minimum 44 px touch height.
- Food summary rows, logged foods, saved-meal choices, saved-meal contents and macro breakdowns
  wrap calorie figures and trailing controls below their labels when needed. The food summary's
  two-line clamp works again after removing a conflicting display class. Portion text can wrap.
- Food week-strip and month-calendar markers keep their circular shape while remaining within
  their seven-column cells at enlarged text sizes. Their number, selected/today states and
  surrounding links remain readable and usable.
- Body-map table rows expose a native keyboard-operable button and pressed state.
- Appearance controls and the page palette now synchronize across tabs. A denied storage write
  retains the visible choice for the current tab, including through navigation metadata updates.

### Daylight-saving ambiguity

When clocks move backwards, a wall-clock time such as 01:30 can represent two distinct instants.
The activity form now shows a required native "Which time?" selection only for repeated local
times. It names the first and second occurrence with their UTC offsets; the server rejects a
missing or invalid offset on new ambiguous actuals. An unchanged correction retains the
original offset and exact instant, including after a profile time-zone change. The displayed
time zone is retained in the draft. Impossible dates and spring-forward gaps are rejected.

The completed aggregate's browser runner passed **14/14 checks**, seven per engine. It verifies spring-gap
errors without writes or lost input; native and server-side missing-choice validation; exact
`05:30Z` versus `06:30Z` persistence for New York's 2 November 2025 repeated hour; narrow light/dark
layouts at normal and doubled text; corrections after changing the profile zone; and an
intentional switch to the other occurrence. Both engines reported no uncaught page errors.

## Audit infrastructure changes

- Added `audit:all` for a repeatable ordered run with per-suite logs and an aggregate exit status.
- Added `audit:ui-controls` for interactive control and viewport regressions, complementing
  route screenshots with actual taps, keyboard actions and native selector changes.
- Added text-geometry checks for narrow columns and unnecessarily broken words. Food checks
  measure readable names, two-line summaries and calendar marker/number containment, because
  absence of horizontal page overflow alone does not establish a readable layout.
- Added `audit:quick-food`, which creates and removes its own local account. It tests an actual
  committed save whose reply is withheld, then retries and checks that only one entry exists.
- Added `audit:activity-time` and `audit:legacy-routes` to the aggregate. The latter checks actual
  redirect status and Location headers, repeated detail/edit navigation, ownership, unavailable
  records, sign-in return destinations and incomplete onboarding.
- Screen visits use fresh documents within an authenticated context and wait for the expected
  destination and real page heading. Each screen records its own errors; workflow suites cover
  client-side navigation. Unexpected destinations remain failures.
- Populated food cases use the seed's fixed final date. Aggregate retries retain failed attempts
  and logs, allowing targeted reruns while keeping the earlier evidence available.
- Runtime output is kept under the ignored audit output directory rather than included in the
  application source changes.
- The subsequent coach-simulation follow-up makes report filenames safe on Windows, retains
  targets on a retry whose cited evidence has already been spent, and explicitly classifies
  superseded jobs instead of treating them as ordinary failures. Its validation is recorded
  separately below.

## Verification record

The complete matrix tested source **`62bd09ef7dccca0405ddf64d5b66ee650698d298`**.
`suite-results.json` records `complete: true`, `passed: true` and **26/26 passing jobs**, from
29 September 2026 at 18:15:19 UTC through 18:48:14 UTC (29–30 September in Asia/Kolkata).
Evidence paths in this section are relative to `output/audit-2026-09-29/`.

| Screen configuration                        |   Visits passed | Failures | Report                                     |
| ------------------------------------------- | --------------: | -------: | ------------------------------------------ |
| Android Chromium, light                     |         154/154 |        0 | `screens-android.json`                     |
| iPhone WebKit, light                        |         154/154 |        0 | `screens-iphone.json`                      |
| 320 px Chromium, light                      |         154/154 |        0 | `screens-narrow.json`                      |
| Desktop Chromium, light                     |         154/154 |        0 | `screens-desktop.json`                     |
| Android Chromium, dark                      |         154/154 |        0 | `screens-android-dark.json`                |
| 320 px Chromium, light, 200% text, expanded |         154/154 |        0 | `screens-narrow-text32-expanded.json`      |
| iPhone WebKit, dark, 200% text, expanded    |         154/154 |        0 | `screens-iphone-dark-text32-expanded.json` |
| **Total**                                   | **1,078/1,078** |    **0** |                                            |

| Check at the matrix checkpoint                    | Verified result                                                                      | Evidence                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Lint and repository formatting                    | Passed — ESLint and Prettier                                                         | Repository check output                                                                     |
| Type checking and production audit build          | Passed — `next typegen`, `tsc --noEmit`, isolated production build                   | Build/check output                                                                          |
| Complete Vitest run                               | 1,850 tests passed across 228 files; final calendar CSS also passed 12 focused tests | Vitest output                                                                               |
| Complete aggregate                                | 26/26 jobs passed                                                                    | `suite-results.json`, `suite-logs/`                                                         |
| Chromium and WebKit workflows                     | 266/266 checks passed                                                                | Per-suite results and logs, summarized above                                                |
| History windows                                   | 244/244 passed: all 224 Chromium account/month windows plus 20 WebKit samples        | `history/results.json`                                                                      |
| Native history filters                            | 20/20 passed; raw history unchanged                                                  | `history/results.json`                                                                      |
| Fixture/RLS invariants before and after workflows | 13/13 passed in each snapshot                                                        | `suite-logs/database-before.log`, `suite-logs/database-after.log`, `seed-verification.json` |
| Multisport and programme schedule diagnostics     | No issues; every programme reports `findings: none` before and after workflows       | Both database logs                                                                          |

The programme schedule CLI is diagnostic and does not fail its process for reported findings.
Its output was therefore inspected separately: all four programmes in each database snapshot
reported `findings: none`. The fixture checks cover 56-month sport/food/weight/recovery coverage,
activity/workout chronology, consent-aware shared projections, latest profile weight and actual
RLS isolation between accounts. Post-workflow counts are recorded in the table above.

The legacy browser total includes ten WebKit and five Chromium repetitions **for each** detail
and edit URL: all 30 repeated navigations returned HTTP 307 with the exact canonical Location
before rendering. The remaining 20 checks cover missing/foreign identifiers, planned-link
unavailability, 404 recovery, sign-in return destinations and incomplete onboarding; these
50/50 results are in `legacy-routes/results.json`. The 14/14 activity-time results are in
`activity-time/results.json`.

### Guardrail follow-up after the matrix

The separate coach simulation exposed a runtime guardrail defect after the completed matrix.
At coarse load increments, an already approved rep target could sit above the nominal range.
Keeping that target was incorrectly clamped to the nominal range and then rejected because
the evidence used for its earlier approval had been spent. The guardrail now retains a bounded
approved baseline; any further increase still requires fresh evidence.

This correction and the simulation changes are committed as
**`67ad25b4b9a65fcfb21b82706dae3380a0218f2d`**. The full 26-job matrix remains associated with
`62bd09ef7dccca0405ddf64d5b66ee650698d298`; it has not been relabelled as validation of this later
change. A separate affected-flow run writes to `coach-guardrail-regression/`, preserving the
completed matrix and its logs.

| Follow-up                                                                  | Status                                                                                                                             |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Guardrail/simulation correction and independent review                     | Committed and reviewed; 42 focused tests passed                                                                                    |
| ESLint, formatting, `next typegen` and `tsc --noEmit` after the correction | Passed                                                                                                                             |
| Production audit build after the correction                                | Passed                                                                                                                             |
| Complete unit run after the correction                                     | **1,857 tests passed across 230 files**, exit 0                                                                                    |
| Complete coach simulation after the correction                             | Passed — all 24 personas over 28 simulated days; zero unexpected refusals or other findings                                        |
| Programme browser flows and before/after database checks                   | 3/3 jobs passed, including 18/18 programme checks across both engines; evidence in `coach-guardrail-regression/suite-results.json` |
| Final tested application source                                            | `67ad25b4b9a65fcfb21b82706dae3380a0218f2d`                                                                                         |

The guardrail rerun's before/after database logs also report no multisport blocking issues and
`findings: none` for all four programme families, with no orphan-family diagnostic. These
results were inspected independently of the schedule CLI's exit status.

The complete simulation passed with **945 work records representing 941 distinct jobs**:
916 accepted records, 24 deliberately refused review attempts and five confirmed superseded
preparations. All five replacement preparations were accepted on the same simulated day.
There were 658 dispatches, no unexpected refusals and no other findings. All eight context JSON
exports were written with valid Windows filenames. Evidence is in `coach-simulation/`; the
initial failure evidence is retained separately in `coach-simulation-attempt-1/`. This exercises
the deterministic reference worker and real application contracts in isolated PGlite, without
an external model.

The changes and this report are on
[`codex/comprehensive-mobile-audit-2026-09-29`](https://github.com/Vinit-Chandak/gym-tracker/tree/codex/comprehensive-mobile-audit-2026-09-29).

## Practical limits

This is a responsive web application with PWA support. It uses native browser controls such as
HTML selects, date/time inputs, radio buttons, checkboxes and dialogs. The local audit exercises
Chromium and WebKit with Android/iPhone device emulation; it does not turn the application into
separate native iOS and Android apps.

Physical-device operating-system pickers, software keyboards, safe areas, screen readers,
installed-PWA behavior and interruption/resume behavior remain unverified on real phones.
Automated accessibility checks do not replace assistive-technology testing. Local authentication
and seeded coaching states do not verify live Supabase email delivery, external coach execution
or production hosting. No production deployment is part of this audit.
