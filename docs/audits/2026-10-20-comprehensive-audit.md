# Comprehensive app audit — 20 October 2026

All **104 page templates** were inventoried, opened and reviewed: 93 production pages
and 11 development previews. The final 28-group browser/workflow matrix passed without
skipped engines. Confirmed UI, logic, navigation and data-preservation defects were fixed
and rechecked. Production compilation, TypeScript, lint and formatting passed.

The complete repository run passed 3,432 tests in 413 files. Sixteen subsequently added
regressions also passed, giving **3,448 unique Vitest tests across 415 files verified
across completed runs**, plus five separate Node inventory tests. This is not a claim that
the complete Vitest suite was rerun after the final CSS, Sheet, Food and boundary changes; those received
focused tests and browser checks. Route reachability does not establish every possible
interaction or data permutation.

This audit covers UI layout, accessibility, navigation, form validation, retained input,
activity and nutrition data, account transitions, coaching and programme flows, error
recovery, and preview behavior. It includes empty and populated accounts, existing and
new-user setup, all four sports, compatibility routes, and unavailable-item screens.

## Environment and evidence

| Component                | Audit configuration                                                           |
| ------------------------ | ----------------------------------------------------------------------------- |
| Application              | Local production build at `http://localhost:3110`                             |
| Development previews     | Local preview-enabled server at `http://localhost:3111`                       |
| Authentication           | Local Supabase-compatible simulator at `127.0.0.1:54326`                      |
| Database                 | Dedicated local PostgreSQL database `overload_audit_20261020` on port 5439    |
| Framework                | Next.js 16.3.4; production compilation uses webpack and `tsconfig.audit.json` |
| History                  | 1 March 2022 through 20 October 2026, 56 calendar months                      |
| Established fixtures     | `vinit`, `shreyash`, `priya`, `alex`; additional empty and setup fixtures     |
| Primary evidence         | `output/audit-2026-10-20/`                                                    |
| Training visual evidence | `output/training-audit/`                                                      |

The fixture export contains 1,590 workouts, 3,301 activities, 100 occurrences, 12 activity
templates, 3 programme drafts, 9 coach jobs, 24 foods and 4 saved meals. These are fixture
counts, not counts of individually reviewed records. Supported date windows cover the long
history without silently falling back from the app's one-year query limit.

The audit harness restricts connections to loopback hosts and the dedicated audit database.
External coach dispatch is disabled. Existing environment files and production services
were not changed. Local email/password and OAuth consent fixtures exercise application
behavior with simulated authentication; real email delivery, external OAuth completion,
production token issuance and external coach/provider handoff remain outside this run.
Local OAuth approval and denial each passed on Android Chromium and iPhone WebKit: four
flows preserved the callback state and returned the expected code or denial. External
callbacks were intercepted locally; these checks issued no external grants.

The [committed verification summary](2026-10-20-verification-summary.json) records aggregate
results and the verification limits. Raw browser captures, traces, logs and disposable
authentication/database fixtures remain local under `output/` and are not included in
this pull request. Their paths below are local evidence references, not GitHub links.
Source-code and test links point to files included in the repository.

Evidence:

- Route inventory (`output/audit-2026-10-20/route-inventory.json`): exact page templates and successful requested URLs.
- [Browser sweep](../../scripts/dev/audit-browser.mjs): current production screen cases, including all seven Progress sections.
- Final suite status (`output/audit-2026-10-20/suite-results.json`), initial run (`output/audit-2026-10-20/suite-final.log`), workflow rerun (`output/audit-2026-10-20/suite-retry.log`) and final Food rerun (`output/audit-2026-10-20/suite-retry-food.log`): 28/28 groups passed; original failures and attempt logs are retained.
- Account review (`output/audit-2026-10-20/account-audit.json`) and post-fix browser results (`output/audit-2026-10-20/account-post-fix/results.json`).
- OAuth decision flows (`output/audit-2026-10-20/oauth-flow/results.json`): four local approval/denial paths, with intercepted callbacks.
- History filter browser checks (`output/audit-2026-10-20/history-empty-filters/results.json`): three populated and three empty cases, read-only after login.
- Training route review (`output/training-audit/route-review.json`): source mapping, reviewed states, viewport and below-fold screenshots for 41 routes.
- Final training visual review (`output/training-audit/final-visual-review.json`) and Android dark review (`output/audit-2026-10-20/contacts-android-dark/visual-review.json`): responsive follow-ups and all 216 dark viewport captures.
- Progress preview checks (`output/training-audit/progress-preview/results.json`) and stable-server recheck (`output/training-audit/progress-preview-recheck/results.json`).
- Template preservation browser/database regression (`output/audit-2026-10-20/template-regression/results.json`): a real edit creates revision 2 while retaining all structured content and leaving revision 1 unchanged.
- Expanded desktop previews (`output/audit-2026-10-20/screens-preview-variants-desktop.json`) and Android previews (`output/audit-2026-10-20/screens-preview-variants-android.json`): 60 additional captures, including mounted logging and rejected-save/retry states.
- Additional confirmation sheets (`output/audit-2026-10-20/hard-overlays/results.json`): 12 successful Unstar/missing-machine dialog checks with screenshots and unchanged-data assertions.
- Keyboard sheet checks (`output/audit-2026-10-20/sheet-keyboard-after/results.json`): 20 successful opening, focus, scrolling, dismissal and focus-restoration cases after the shared Sheet fix.
- Complete account rerun (`output/audit-2026-10-20/account-rerun/accounts/results.json`): 22 successful Android/iPhone workflows with zero runtime errors or skipped cases.
- Full Vitest run (`output/audit-2026-10-20/tests-final.log`) and new logging regression (`output/audit-2026-10-20/tests-last-regression.log`): completed test evidence.

## Coverage rules

The following tables list all 104 templates exactly once. **S** means the route and relevant
component/action branches were source-reviewed. **B** means at least one browser visit
rendered the intended screen without a recorded exception, overflow or violation in the
checks that ran; explicit compatibility redirects count only for their intended redirect behavior.
All rows below have S/B evidence. A note describes representative states, not an exhaustive
list of every possible value.
The generic sweep runs axe on Android variants; its desktop/iPhone/narrow results do not
independently establish axe coverage. Targeted workflow and overlay checks run axe on the
engines named in their evidence.

The inventory now resolves the most specific matching route. For example, visiting
`/exercises/new` cannot count as visiting an exercise detail page, and `/food/targets` cannot
count as a meal. Expected unavailable-item responses and caught error boundaries are
excluded even when Next streams them with HTTP 200. The intended error preview is exempt
only when both its requested and rendered route are the error preview. An onboarding guard
redirect does not count as rendering its requested screen. Five focused
[inventory regressions](../../scripts/dev/audit-route-matcher.test.mjs) verify these rules.
Rechecking 1,995 saved screen rows after adding the error-boundary guard found no unexpected
error boundaries; six intentional error-preview cases remained accepted.

Viewport captures were reviewed alongside full-page content where needed. Account review
covered 61 desktop cases and 86 below-fold crops; training review covered 105 desktop
captures and 28 below-fold captures. Food and Progress review included desktop and Android
contact sheets, original calendar/day/empty-state frames and preview variants. The final
iPhone review additionally inspected all 43 Food/Progress captures in
sheets 2–6, 21 and 22 (`output/audit-2026-10-20/contacts-iphone/index.json`), including
all seven meal pages, all seven Progress sections, long-history windows and empty states;
original full-page Recovery, Food graph and Targets frames were also inspected. These
overlapping visual counts must not be added to derive a unique screen total.

The iPhone Targets save action was checked after scrolling: its center was unobstructed and
its full button stayed above the navigation. The isolated
browser recheck (`output/audit-2026-10-20/food-iphone-review/targets-recheck.json`)
had no runtime errors or blocked requests; the
scrolled frame (`output/audit-2026-10-20/food-iphone-review/targets-scrolled.png`)
confirms the apparent overlap in the initial full-page capture was not an unreachable action.

Non-page fallback screens were checked separately. The final
20 live boundary cases (`output/audit-2026-10-20/boundaries-after-production-final/results.json`)
cover standalone offline, anonymous/authenticated root not-found and app not-found screens,
including recovery navigation and offline Retry. All passed layout, accessibility and
runtime checks. These contexts block service workers to isolate the boundaries; the full
Food workflow separately exercises production service-worker/offline behavior.
Eight root/global error fixtures (`output/audit-2026-10-20/global-error-after-production/results.json`)
render the actual boundary components with production CSS on desktop and at 320px/200%
text in both engines. Their actions align, clear the content and remain reachable. These
are component renders, not deliberately induced live root-layout exceptions.

All 45 `loading.tsx` files were source-reviewed and rendered as
46 loading states (`output/audit-2026-10-20/loading-fixtures/inventory.json`),
including active and finished workout framing. The 12 distinct compositions received
82 browser layout/accessibility checks (`output/audit-2026-10-20/loading-renders-final/results.json`):
every state at 320px/200% text and representative compositions on desktop and WebKit at
normal and enlarged text. All passed with production CSS, and the
final contact sheets (`output/audit-2026-10-20/contacts-loading-fixtures-final/index.json`)
were visually inspected. This verifies the actual loading components' presentation; it
does not claim that every live route was artificially stalled.

The final 320px sweep (`output/audit-2026-10-20/contacts-narrow/index.json`) and
320px sweep at 200% text (`output/audit-2026-10-20/contacts-narrow-text32-expanded/index.json`)
each received a visual review of all 43 Food/Progress captures, including the empty and
active-workout accounts. No additional defects were confirmed. A separate read-only
enlarged-text browser check (`output/audit-2026-10-20/food-narrow-text-review/results.json`)
confirmed unobstructed Targets save, Recovery value disclosure and numbered History
pagination controls, with no horizontal overflow, runtime errors or blocked requests.
The scrolled Targets, expanded Recovery values and History pagination frames were also
visually inspected.

The wider responsive review inspected 63 account captures each on iPhone, at 320px and at
320px/200% text; the iPhone and enlarged-text reviews also inspected 69 and 194 below-fold
crops respectively. Training inspected 105 captures in each of those three configurations,
plus the 60 preview variants and 26 scrolled preview frames. All 216 Android dark captures
were visually inspected. Enlarged-text review found nine additional responsive defects
listed below. Focused development checks passed, followed by the final production rebuild
and affected-screen rechecks.

The Unstar confirmation and registered-machine “not here?” sheet were exercised on isolated
fixtures in both phone engines at normal size, 320px/200% text and dark mode/200% text.
All 12 cases passed dialog/content/link checks, axe, document overflow checks and reachable
cancellation; every screenshot was inspected. Cancellation preserved saved meals, food
entries, equipment, sessions and workout exercises, verified by database snapshots after
each case. The disposable account and its fixtures were then removed. The Food workflow
was also expanded to open Carbs, Fat and Protein separately, checking each nutrient's
grouped grams, unknown values, standing text and focus restoration; its Android execution
passed on both Android and iPhone in the completed matrix.

### Entry, authentication and setup — 18 templates

| Route template                   | Evidence | States and flows reviewed                                                       |
| -------------------------------- | -------- | ------------------------------------------------------------------------------- |
| `/`                              | S/B      | Entry redirect for account/setup state                                          |
| `/warm`                          | S/B      | Warm-start destination and authenticated transition                             |
| `/login`                         | S/B      | Credentials, validation, pasted email, destination                              |
| `/signup`                        | S/B      | New account and initial setup transition                                        |
| `/forgot-password`               | S/B      | Email validation, retained input, announced success                             |
| `/reset-password`                | S/B      | Authenticated recovery fixture, password validation and retained fields         |
| `/oauth/consent`                 | S/B      | Local valid authorization, malformed/missing request, owner/client restrictions |
| `/welcome`                       | S/B      | Experience and sports selection; narrow/desktop/large text                      |
| `/welcome/sports`                | S/B      | Compatibility redirect to current first step                                    |
| `/welcome/gym`                   | S/B      | Home/gym setup and pinned action placement                                      |
| `/welcome/equipment`             | S/B      | Artwork/no-art equipment, selection and navigation                              |
| `/welcome/programme`             | S/B      | Programme choice for fresh setup fixture                                        |
| `/welcome/programme/create`      | S/B      | Coach intake and validation                                                     |
| `/welcome/programme/manual`      | S/B      | Manual builder and setup continuation                                           |
| `/welcome/programme/split`       | S/B      | Split selection                                                                 |
| `/welcome/programme/template`    | S/B      | Template selection                                                              |
| `/welcome/programme/drafts/[id]` | S/B      | Seeded draft review and activation branches                                     |
| `/welcome/programme/jobs/[id]`   | S/B      | Five job fixtures; successful no-change, waiting and error branches             |

### Account and social — 18 templates

| Route template                            | Evidence | States and flows reviewed                                |
| ----------------------------------------- | -------- | -------------------------------------------------------- |
| `/profile`                                | S/B      | Account overview, sign-out confirmation/failure/retry    |
| `/profile/edit`                           | S/B      | Profile fields and validation                            |
| `/profile/password`                       | S/B      | Mismatch/server errors retain both password fields       |
| `/profile/delete-account`                 | S/B      | Destructive confirmation and authentication requirements |
| `/profile/privacy`                        | S/B      | Sharing preferences and visibility                       |
| `/profile/sports`                         | S/B      | Sport preferences                                        |
| `/profile/routines`                       | S/B      | Routine settings and empty/populated state               |
| `/profile/coach`                          | S/B      | Coach preferences and job/approval context               |
| `/profile/ai-coach`                       | S/B      | AI-coach account configuration                           |
| `/profile/friends`                        | S/B      | Following/pending/empty relationships                    |
| `/profile/friends/people`                 | S/B      | People list and query navigation                         |
| `/profile/friends/find`                   | S/B      | Search and unavailable person                            |
| `/profile/friends/compare`                | S/B      | Comparison selection                                     |
| `/profile/friends/leaderboard`            | S/B      | Strength, running, cycling and swimming                  |
| `/u/[username]`                           | S/B      | Own/other profiles, privacy, sports and follow state     |
| `/u/[username]/compare`                   | S/B      | Four-sport comparison variants                           |
| `/u/[username]/compare/[exerciseId]`      | S/B      | Exercise-specific comparison                             |
| `/u/[username]/activities/[sharedStatId]` | S/B      | Shared activity detail and access boundaries             |

### Gyms and exercise library — 11 templates

| Route template                                  | Evidence | States and flows reviewed                             |
| ----------------------------------------------- | -------- | ----------------------------------------------------- |
| `/gyms`                                         | S/B      | Existing gym library and selection                    |
| `/gyms/new`                                     | S/B      | Gym creation form                                     |
| `/gyms/[gymId]`                                 | S/B      | Owned gym and unavailable ID                          |
| `/gyms/[gymId]/edit`                            | S/B      | Gym edit fields                                       |
| `/gyms/[gymId]/equipment/new`                   | S/B      | New equipment choice                                  |
| `/gyms/[gymId]/equipment/[equipmentId]`         | S/B      | Equipment detail/edit                                 |
| `/gyms/[gymId]/programme`                       | S/B      | Gym-specific programme                                |
| `/gyms/[gymId]/programme/[exerciseId]/fallback` | S/B      | Equipment fallback/substitution                       |
| `/exercises`                                    | S/B      | Searchable exercise library                           |
| `/exercises/new`                                | S/B      | Custom exercise form                                  |
| `/exercises/[exerciseId]`                       | S/B      | Real exercise detail and separate invalid-ID response |

### Today, activity logging and scheduled training — 19 templates

| Route template                                   | Evidence | States and flows reviewed                                           |
| ------------------------------------------------ | -------- | ------------------------------------------------------------------- |
| `/today`                                         | S/B      | Populated, empty and active-session accounts                        |
| `/today/choose`                                  | S/B      | Activity/workout choice                                             |
| `/training`                                      | S/B      | Training hub across active and empty accounts                       |
| `/training/log`                                  | S/B      | Default and four sports, with/without explicit date                 |
| `/training/new`                                  | S/B      | Running/cycling/swimming, independent and occurrence-linked         |
| `/training/activities/[activityId]`              | S/B      | Three sport records, completion and unavailable ID                  |
| `/training/activities/[activityId]/edit`         | S/B      | Three sports; corrected date, effort and retained input             |
| `/training/days/[dayId]`                         | S/B      | Seven populated day fixtures                                        |
| `/training/programme`                            | S/B      | Default and endurance sport queries                                 |
| `/training/programme/occurrences/[occurrenceId]` | S/B      | Three sport occurrences; planned/logged/standalone provenance       |
| `/training/programmes/[sport]`                   | S/B      | All four sports; invalid sport checked separately                   |
| `/training/programmes/[sport]/edit`              | S/B      | Running/cycling/swimming programme edits                            |
| `/training/programmes/archived`                  | S/B      | Archived programme access                                           |
| `/training/programmes/new`                       | S/B      | Four sports, whole-programme/standalone scope, coach/manual choices |
| `/training/schedule`                             | S/B      | Running/cycling/swimming scheduling                                 |
| `/training/scheduled`                            | S/B      | Upcoming, missed, logged, skipped; date-preserving log links        |
| `/training/templates`                            | S/B      | Template list and session actions                                   |
| `/training/templates/new`                        | S/B      | Overall targets, repeats and validation                             |
| `/training/templates/[templateId]/edit`          | S/B      | Three sport fixtures; rich step preservation and unavailable ID     |

### Workouts and compatibility routes — 10 templates

| Route template                                                   | Evidence | States and flows reviewed                            |
| ---------------------------------------------------------------- | -------- | ---------------------------------------------------- |
| `/workouts/start`                                                | S/B      | Gym-linked start                                     |
| `/workouts/[sessionId]`                                          | S/B      | Active and completed workouts; invalid ID separately |
| `/workouts/[sessionId]/add-exercise`                             | S/B      | Exercise addition                                    |
| `/workouts/[sessionId]/check-in`                                 | S/B      | Recovery/readiness form and retained input           |
| `/workouts/[sessionId]/exercises/[workoutExerciseId]/substitute` | S/B      | Substitute selection                                 |
| `/workouts/[sessionId]/finish`                                   | S/B      | Finish/check-out review                              |
| `/runs`                                                          | S/B      | Legacy list redirect                                 |
| `/runs/new`                                                      | S/B      | Legacy new-run redirect                              |
| `/runs/[runId]`                                                  | S/B      | Legacy detail resolves actual activity               |
| `/runs/[runId]/edit`                                             | S/B      | Legacy edit resolves actual activity editor          |

### Programme management and coaching — 7 templates

| Route template                             | Evidence | States and flows reviewed                                 |
| ------------------------------------------ | -------- | --------------------------------------------------------- |
| `/profile/programme`                       | S/B      | Current programme and changes view                        |
| `/profile/programme/create`                | S/B      | Coach intake                                              |
| `/profile/programme/manual`                | S/B      | Manual programme creation                                 |
| `/profile/programme/drafts/[id]`           | S/B      | Draft review and activation                               |
| `/profile/programme/drafts/[id]/programme` | S/B      | Builder restrictions by sport, scope and draft state      |
| `/profile/programme/jobs/[id]`             | S/B      | Three account job fixtures; waiting/result/error branches |
| `/profile/programme/history`               | S/B      | Prior programmes and coaching changes                     |

### Food, body and Progress — 10 templates

| Route template              | Evidence | States and flows reviewed                                                        |
| --------------------------- | -------- | -------------------------------------------------------------------------------- |
| `/food`                     | S/B      | Empty/populated day, historical date, targets, quick add and calendar            |
| `/food/[meal]`              | S/B      | All seven meal slugs, seeded day, search/portion/save states                     |
| `/food/targets`             | S/B      | Target validation and retained input                                             |
| `/food/my-foods`            | S/B      | Foods/meals/search, URL navigation, query changes without remount                |
| `/food/my-foods/meals/new`  | S/B      | Meal builder, invalid amount, pending state                                      |
| `/food/my-foods/meals/[id]` | S/B      | Existing saved meal, edit/delete/error state                                     |
| `/progress`                 | S/B      | Overview, strength, muscles, running, food, recovery, body; empty/range branches |
| `/progress/history`         | S/B      | Record kinds, long-history windows, empty selected filters                       |
| `/progress/calendar`        | S/B      | Populated/empty calendar and exact 24-month bounds                               |
| `/progress/day/[date]`      | S/B      | Populated and empty day; invalid date checked separately                         |

The final iPhone Food graph capture rendered successfully and was visually reviewed.
Source review and targeted component checks are complete. Bodyweight,
daily recovery and workout recovery were also traced through their shared forms, actions,
domain calculations and repositories. Overview intentionally displays the current month;
the explicit date-range controls belong to the other graph sections.

### Development previews — 11 templates

| Route template      | Evidence | States and flows reviewed                                            |
| ------------------- | -------- | -------------------------------------------------------------------- |
| `/preview`          | S/B      | Today composition and fixture navigation                             |
| `/preview/art`      | S/B      | Activity prints, calendar and visual vocabulary                      |
| `/preview/coaching` | S/B      | Options, intake, manual, draft, changes, unchanged and equipment     |
| `/preview/error`    | S/B      | Default, online and elsewhere error states                           |
| `/preview/food`     | S/B      | Eleven page/state combinations; mutation guards and local navigation |
| `/preview/headers`  | S/B      | Header and navigation compositions                                   |
| `/preview/icons`    | S/B      | Icon list semantics and narrow layout                                |
| `/preview/logging`  | S/B      | Normal and failure logging fixture                                   |
| `/preview/progress` | S/B      | Overview/History, four account states, ranges and working selectors  |
| `/preview/system`   | S/B      | Type, color and control specimens                                    |
| `/preview/workout`  | S/B      | Workout fixture and visible controls                                 |

Progress preview originally failed with HTTP 500 because fixture history omitted
`occurredOn`. Typed records now render correctly, state lookup rejects inherited object
keys, selectors navigate between real fixtures, and fixture links remain inside preview.
Twenty-two desktop/Android query cases were exercised. One response encountered a temporary
Next manifest read during a simultaneous rebuild; the identical case passed on both devices
after the server stabilized. The original failure and recheck are both retained.

## Defects fixed

The rows below group closely related symptoms by cause. Tests are focused regressions unless
a browser evidence link is provided.

The final Food workflow exposed an intermittent lost click in WebKit. The
event trace (`output/audit-2026-10-20/food-navigation-early-trace/results.json`)
shows a press on My foods at scroll position 198px, followed by the day strip's delayed
`scrollIntoView()` resetting the document to 0px before release. The click then landed on
a common ancestor instead of the link. The strip now adjusts only its own horizontal
scroll position; six regression cases cover selected weeks/days to the left, right and
already visible; the focused test run (`output/audit-2026-10-20/food-scroll-food-days-tests.log`)
passed 11/11 including those six additions. The development early-click replay (`output/audit-2026-10-20/food-navigation-early-after-dev/results.json`)
passed 30/30. The final production
controlled hydration replay (`output/audit-2026-10-20/food-hydration-press-final/results.json`)
passed both My foods and Late-night snack: JavaScript was held until pointer-down, then
hydration ran before release. The horizontal strip update preserved the document's scroll
position and both clicks reached their intended routes, with zero app runtime errors.
The original failures remain preserved.

The resize matrix then reproduced a separate selected-day issue in both engines:
an earlier selected day could move outside the strip when the viewport narrowed at 200%
text without crossing the week/day breakpoint. The reveal effect now responds to measured
width and root text size as well as date and layout mode. Two new viewport/text-size
regressions passed with the existing strip/calendar tests:
13/13 focused cases (`output/audit-2026-10-20/food-resize-regression-tests.log`).
The final production 24-case resize matrix (`output/audit-2026-10-20/food-strip-resize-final/results.json`)
covers today and an earlier date in Chromium and WebKit, changing between 390px and 320px
and between normal and 200% text without remounting. The selected day stays visible and
the page fits horizontally; all final captures (`output/audit-2026-10-20/contacts-food-resize-final/index.json`)
were visually inspected.

Template preservation also passed through the real browser and local PostgreSQL: renaming a
template retained its warm-up, repeat and cooldown nodes, per-step ranges, effort, notes,
instructions and overall `[0, 2]` effort. The old immutable revision stayed unchanged and a
new revision 2 held the new name. The
browser/database evidence (`output/audit-2026-10-20/template-regression/results.json`)
includes the before-save and saved screenshots.

The saved-food rerun then exposed a separate refresh race. Two of six diagnostic saves
returned successfully and included the new food in the server response, but the visible
library stayed stale until reload. Clearing an already-empty search called native
`replaceState` while the Server Action's refreshed content was still committing.
The library now skips unchanged URL writes. When a successful creation needs to clear
search or pagination, it uses router navigation followed by a queued refresh, preserving
unrelated query parameters. Three regressions cover the unchanged URL, ordered navigation
and refresh, and retained filters after a failed save.
The original diagnostic (`output/audit-2026-10-20/food-save-race-before/results.json`)
and 12-test focused run (`output/audit-2026-10-20/food-save-race-tests.log`) are retained.
The six production saves (`output/audit-2026-10-20/food-save-race-production/results.json`)
then passed without reloads, including an empty library, active searches and second-page
filters. Both complete 18-check Food workflows passed:
Chromium (`output/audit-2026-10-20/food-scroll-production/food-chromium/results.json`)
and WebKit (`output/audit-2026-10-20/food-webkit/results.json`), including production
service-worker/private-cache behavior. The final
database checks (`output/audit-2026-10-20/database-complete.log`) also passed.

The standalone fallback review found that the root not-found and root error screens lacked
a main landmark. Root/global errors also inherited the authenticated app's navigation
spacing despite replacing that shell: the desktop action column shifted by 96px, and
mobile actions left an unnecessary 78px gap. Root fallback landmarks and scoped standalone
spacing now address those defects while app-contained errors keep their navigation
clearance. The [three new regressions](../../src/app/boundaries.test.tsx) and four existing
navigation/style tests passed together (`output/audit-2026-10-20/boundary-focused-tests.log`).

| Area and defect                                        | Root cause and resulting behavior                                                                                                                                                                                                                    | Sources and verification                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-out lost local drafts on failure                  | Draft cleanup happened before the provider confirmed sign-out; failures were hidden by redirect. The server returns an explicit outcome, failures offer retry and preserve drafts, and success clears only the current account's drafts.             | [Action](../../src/server/actions/auth.ts), [UI](<../../src/app/(app)/profile/sign-out-row.tsx>), [action tests](../../src/server/actions/auth.test.ts), [UI tests](<../../src/app/(app)/profile/sign-out-row.test.tsx>), real browser failure/retry (`output/audit-2026-10-20/account-post-fix/results.json`)                                                                         |
| Password errors cleared both fields                    | Native action-form reset discarded input after validation errors. Account and recovery password forms use the existing kept-form guard and announce success.                                                                                         | [Account form](<../../src/app/(app)/profile/password/password-form.tsx>), [recovery form](<../../src/app/(auth)/reset-password/reset-password-form.tsx>), [regression](<../../src/app/(app)/profile/password/password-form.test.tsx>)                                                                                                                                                  |
| Pasted email rejected surrounding spaces               | Authentication validation treated surrounding email whitespace as part of the address. Emails are trimmed while password whitespace stays intact.                                                                                                    | [Auth action and tests](../../src/server/actions/auth.test.ts)                                                                                                                                                                                                                                                                                                                         |
| Forgot-password success lacked announcement            | Confirmation had no live status semantics. Success now uses `role=status`.                                                                                                                                                                           | [Form](<../../src/app/(auth)/forgot-password/forgot-password-form.tsx>), [existing form checks](<../../src/app/(auth)/forgot-password/forgot-password-form.test.tsx>)                                                                                                                                                                                                                  |
| Follow state leaked across profiles                    | Acknowledged local relationship state and unfollow confirmation survived a change in person identity. Both reset when the person changes.                                                                                                            | [Component](../../src/components/follow-button.tsx), [regression](../../src/components/follow-button.test.tsx)                                                                                                                                                                                                                                                                         |
| Malformed OAuth consent link threw                     | Untrusted authorization IDs used throwing schema parsing. Invalid IDs now render the unavailable state; owner/client and callback restrictions remain enforced.                                                                                      | [Consent service](../../src/server/coach-connector-consent.ts), [service tests](../../src/server/coach-connector-consent.test.ts), [page tests](../../src/app/oauth/consent/page.test.tsx)                                                                                                                                                                                             |
| Onboarding action was horizontally offset              | Pinned actions inherited the desktop app rail offset despite onboarding having no rail. The onboarding layout now starts at the viewport edge.                                                                                                       | [Styles](../../src/styles/form-v2/onboarding.css), 12 post-fix layouts (`output/audit-2026-10-20/account-post-fix/results.json`)                                                                                                                                                                                                                                                       |
| Sport/equipment labels broke awkwardly                 | Sport chips used columns too narrow for whole words; no-art equipment labels competed with controls. Flexible columns and a separate label row preserve readable names.                                                                              | [Styles](../../src/styles/form-v2/onboarding.css), desktop/mobile/320px/200% text evidence (`output/audit-2026-10-20/account-post-fix/results.json`)                                                                                                                                                                                                                                   |
| Select lacked its accessible label in production       | A server-rendered Select wrapper crossed into client Field before its generated ID could reach the native control. Select now has a client boundary so Field attaches the ID correctly.                                                              | [Select](../../src/components/ui/select.tsx), [Field tests](../../src/components/ui/field.test.tsx), [boundary checks](../../src/client-boundary.test.ts); the production Android sweep passed the affected strength-location controls                                                                                                                                                 |
| Malformed graph date crashed rendering                 | Date conversion called `toISOString()` before rejecting invalid dates. Range validation now checks finite dates before arithmetic/conversion and returns a validation result.                                                                        | [Range parser](../../src/domain/graph-range.ts), [invalid-calendar-date regressions](../../src/domain/graph-range.test.ts)                                                                                                                                                                                                                                                             |
| Zero-assistance strength result disappeared            | Truthiness filtering treated valid zero assistance like missing weight. Zero remains a valid assisted result and can beat a positive-assistance record.                                                                                              | [Progress calculations](../../src/domain/progress-graphs.ts), [regression](../../src/domain/progress-graphs.test.ts)                                                                                                                                                                                                                                                                   |
| Saved-food search became stale after navigation        | Search state was captured only at mount. The library now derives its active place/query from the current search parameters.                                                                                                                          | [Library](<../../src/app/(app)/food/my-foods/my-foods-view.tsx>), [mounted query-change test](<../../src/app/(app)/food/my-foods/my-foods-view.test.tsx>)                                                                                                                                                                                                                              |
| Empty History filter lost selected sport               | Filter options depended on present records, excluding a selected cycling/swimming kind when its result was empty. The selected option is retained.                                                                                                   | [History](<../../src/app/(app)/progress/history/history-view.tsx>), [cycling/swimming/recovery regressions](<../../src/app/(app)/progress/history/history-view.test.tsx>)                                                                                                                                                                                                              |
| Historical food day was ambiguous                      | The Food header did not identify a non-current day. Historical pages now show their date; preview date navigation uses the correct query separator.                                                                                                  | [Food view](<../../src/app/(app)/food/food-view.tsx>), [view tests](<../../src/app/(app)/food/food-view.test.tsx>)                                                                                                                                                                                                                                                                     |
| Food calendar failed indefinitely                      | Failed month reads left loading state without useful recovery. The calendar now leaves busy state, announces the error and supports retry.                                                                                                           | [Calendar](../../src/components/food/food-days.tsx), [failure/retry test](../../src/components/food/food-days.test.tsx)                                                                                                                                                                                                                                                                |
| Meal amount error was invisible                        | The builder displayed general/name errors but omitted the server's amount error. It now renders the amount message and blocks conflicting row actions while pending.                                                                                 | [Builder](<../../src/app/(app)/food/my-foods/meals/meal-builder.tsx>), [regression](<../../src/app/(app)/food/my-foods/meals/meal-builder.test.tsx>)                                                                                                                                                                                                                                   |
| Progress calendar bound drifted                        | Subtracting `23 × 31` days approximated months and could overreach. The earliest displayed month is now exactly 23 calendar months before the current month.                                                                                         | [Page](<../../src/app/(app)/progress/calendar/page.tsx>), [calendar checks](<../../src/app/(app)/progress/calendar/calendar-view.test.tsx>)                                                                                                                                                                                                                                            |
| Recovery graph opened incomplete evidence              | Aggregated values combined daily and workout recovery, while their links filtered to workout records. Aggregate drilldowns now show the complete date-range history.                                                                                 | [Recovery section](<../../src/app/(app)/progress/sections/recovery-section.tsx>), [shared links](../../src/components/graph/labels.ts), [month/week/day regressions](<../../src/app/(app)/progress/sections/recovery-section.test.tsx>)                                                                                                                                                |
| Populated schedule hid scheduling entry point          | The scheduling action was only exposed in limited states. It remains reachable when upcoming sessions exist.                                                                                                                                         | [Scheduled page](<../../src/app/(app)/training/scheduled/page.tsx>), [state regressions](<../../src/app/(app)/training/scheduled/page.test.tsx>)                                                                                                                                                                                                                                       |
| Scheduled rows opened the wrong next action/date       | Logged rows still invited logging; missed sessions defaulted to today; earlier skipped sessions could disappear. Logged rows open their record, past sessions preserve their date, and skipped sessions remain reachable.                            | [Scheduled page and tests](<../../src/app/(app)/training/scheduled/page.test.tsx>)                                                                                                                                                                                                                                                                                                     |
| Standalone session claimed programme provenance        | Independent occurrence plans received a source badge meant for programme/coach plans. The badge is now conditional on actual provenance.                                                                                                             | [Occurrence page](<../../src/app/(app)/training/programme/occurrences/[occurrenceId]/page.tsx>), [regression](<../../src/app/(app)/training/programme/occurrences/[occurrenceId]/page.test.tsx>)                                                                                                                                                                                       |
| Template repeats silently disappeared                  | Selecting a repeated block without repetitions was accepted if another overall target existed. The form now requires a valid repetition count and maps prescription errors to visible fields.                                                        | [Validation](../../src/server/validation/template-form.ts), [regressions](../../src/server/validation/template-form.test.ts)                                                                                                                                                                                                                                                           |
| Editing a rich template discarded its structure        | The compact editor regenerated every prescription, losing coach-written steps/instructions it could not represent. It now preserves richer nodes/instructions, shows their plan, edits supported overall fields and rejects sport changes.           | [Representability check](../../src/domain/template-editor.ts), [edit action](../../src/server/actions/activity-templates.ts), [action regressions](../../src/server/actions/template-edits.test.ts), [validation regressions](../../src/server/validation/template-form.test.ts)                                                                                                       |
| Valid zero-start prescribed effort could not be edited | Form bounds used the athlete-reported effort scale instead of prescribed effort bounds. Zero is accepted as “not asked,” with matching hints and a rename regression for `[0, 2]`.                                                                   | [Validation](../../src/server/validation/template-form.ts), [editor](../../src/components/activities/prescription-editor.tsx), [regression](../../src/server/validation/template-form.test.ts)                                                                                                                                                                                         |
| Lifting builder admitted incompatible drafts           | Builder routing did not fully restrict sport, standalone scope and closed draft states. Unsupported drafts now take the appropriate unavailable/redirect branch.                                                                                     | [Builder page](../../src/components/coaching/builder-page.tsx), [guard tests](../../src/components/coaching/builder-page.test.tsx)                                                                                                                                                                                                                                                     |
| Successful setup job looked failed                     | Successful no-change/complete outcomes fell through to failure copy. They now show success, rationale and a route back to Today.                                                                                                                     | [Setup job](<../../src/app/(onboarding)/welcome/programme/jobs/[id]/page.tsx>), [tests](<../../src/app/(onboarding)/welcome/programme/jobs/[id]/page.test.tsx>)                                                                                                                                                                                                                        |
| Food previews could invoke real mutations              | Preview pages reused live action-bound controls. A preview action context now intercepts all nutrition mutation entry points and returns clear preview feedback. Normal pages keep their actions.                                                    | [Action context](../../src/components/food/food-actions.tsx), [preview shell](<../../src/app/(preview)/preview/food/page.tsx>), [food editor tests](<../../src/app/(app)/food/[meal]/meal-editor.test.tsx>), [targets tests](<../../src/app/(app)/food/targets/targets-form.test.tsx>), [saved-meal tests](<../../src/app/(app)/food/my-foods/meals/meal-builder.test.tsx>)            |
| Coaching previews could invoke real mutations          | Intake, builder, draft, change and equipment controls used production actions. Explicit preview props block writes and preserve useful feedback/navigation.                                                                                          | [Preview page](<../../src/app/(preview)/preview/coaching/page.tsx>), [intake tests](../../src/components/coaching/intake-form.test.tsx), [builder tests](../../src/components/coaching/program-builder.test.tsx), [change tests](../../src/components/coaching/change-detail.test.tsx), [equipment tests](<../../src/app/(onboarding)/welcome/equipment/equipment-step-form.test.tsx>) |
| Progress preview crashed and had inert navigation      | Incomplete history fixtures and placeholder selectors prevented useful previews. Typed dates, safe state lookup, real fixture selectors, supported local links and functional ranges now work.                                                       | [Preview page](<../../src/app/(preview)/preview/progress/page.tsx>), [regressions](<../../src/app/(preview)/preview/progress/page.test.tsx>), browser recheck (`output/training-audit/progress-preview-recheck/results.json`)                                                                                                                                                          |
| Logging preview deleted real workout drafts            | Preview mount cleanup removed every `overload:draft` key as well as its own fixture. It now removes only keys for the fixed preview session, preserving unrelated unsaved workouts.                                                                  | [Logging preview](<../../src/app/(preview)/preview/logging/logging-preview.tsx>), [real/fixture draft regression](<../../src/app/(preview)/preview/logging/logging-preview.test.tsx>); 1 test and scoped ESLint passed                                                                                                                                                                 |
| Icon preview had invalid list nesting                  | List items were nested directly inside list items. Markup now preserves valid list semantics.                                                                                                                                                        | [Icon preview](<../../src/app/(preview)/preview/icons/page.tsx>), final preview accessibility sweep                                                                                                                                                                                                                                                                                    |
| Coverage could overstate dynamic routes                | Broad matching counted literal siblings and streamed unavailable screens; caught error boundaries could also look successful at HTTP 200. Specificity matching, negative-case exclusion and error-boundary detection now count only rendered routes. | [Inventory](../../scripts/dev/audit-inventory.mjs), [matcher and predicate](../../scripts/dev/audit-route-matcher.mjs), [five regressions](../../scripts/dev/audit-route-matcher.test.mjs)                                                                                                                                                                                             |

Shared sheets also failed keyboard scrolling in WebKit: Tab could not reach a scroll
container containing only text, leaving content below the fold inaccessible. The Sheet
body is now a named, focusable region. The logging preview also has a main landmark.
The 20-case keyboard recheck (`output/audit-2026-10-20/sheet-keyboard-after/results.json`)
passed across Chromium and WebKit at normal and enlarged sizes, including Enter to open,
Tab to the body, PageDown scrolling, Escape and focus restoration, with zero axe violations.
The [Sheet regression](../../src/components/ui/sheet.test.tsx) verifies the focusable region.

The enlarged-text review added these fixes. The table preserves the original development
verification; final production rechecks are linked below.

| Responsive defect                                        | Root cause and resulting behavior                                                                                    | Sources and verification                                                                                                                                                                                                                              |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile identity broke ordinary names into fragments     | Avatar, identity and edit control competed for one row. Identity text can now take a full row when cramped.          | [Profile styles](../../src/styles/form-v2/rows.css), identity layouts (`output/audit-2026-10-20/identity-layouts-3111/results.json`)                                                                                                                  |
| Comparison identities became unreadable                  | Two person columns stayed side by side beyond the width their names needed. They now stack at narrow/enlarged sizes. | [Comparison styles](../../src/styles/form-v2/people.css), identity layouts (`output/audit-2026-10-20/identity-layouts-3111/results.json`)                                                                                                             |
| Profile email was squeezed beside its label              | The fact row forced label and value onto one line. The email can now take its own full-width row.                    | [Fact-row styles](../../src/styles/form-v2/rows.css), six email layouts (`output/audit-2026-10-20/identity-layouts-3111-profile-edit/results.json`)                                                                                                   |
| Appearance label and mode fragmented                     | The setting lacked its existing flexible content wrapper. The current mode now wraps below the complete label.       | [Appearance row](../../src/components/shell/appearance-row.tsx), six chooser layouts (`output/audit-2026-10-20/identity-layouts-3111-appearance/results.json`), [component regression](../../src/components/shell/appearance-sync.test.tsx)           |
| Coach change Approve action clipped                      | A non-wrapping action row squeezed its primary label. Wrapping and a max-content basis retain the full action.       | [Change detail](../../src/components/coaching/change-detail.tsx), [13 component checks](../../src/components/coaching/change-detail.test.tsx), three action/revision browser cases (`output/audit-2026-10-20/change-actions-responsive/results.json`) |
| Native date-picker indicator was cropped                 | An intrinsic grid track exceeded the input's available width. The native date/time grid now uses `minmax(0, 1fr)`.   | [Native control styles](../../src/app/globals.css), 12-case native-control matrix (`output/audit-2026-10-20/native-controls-responsive/results.json`)                                                                                                 |
| iPhone coach select caused invisible horizontal overflow | Long selected programme text made a 390px document grow to 725px. The select now wraps within its available width.   | [Coach styles](../../src/styles/form-v2/coach.css), before measurement (`output/audit-2026-10-20/coach-overflow-responsive/results.json`), 12-case native-control matrix (`output/audit-2026-10-20/native-controls-responsive/results.json`)          |

The identity, email and Appearance checks passed 36/36 configurations spanning desktop,
phone and 320px widths at normal and 200% text. The native-control matrix passed 12/12
cases across Chromium 320px and WebKit iPhone dark mode, at normal and 200% text, with no
runtime errors, horizontal overflow or axe violations. All 16 native-control captures
were visually reviewed.

Two further coaching defects appeared while opening each tab at 200% text. Fixed grid
fractions split “Overview” inside its word; tabs now wrap according to their content.
Requests and Notes also exceeded a 320px viewport because a programme filter reserved
a fixed 48px for its growing label and the panel grid expanded to its intrinsic width.
The panel now has a bounded track and the filter can wrap. The
six panel checks (`output/audit-2026-10-20/coach-panels-after/results.json`) confirm
all three tabs fit 320px on Chromium and WebKit after the
[coach styles](../../src/styles/form-v2/coach.css) changes.

## Verification status

| Check                                  | Verified result                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route-template inventory               | 104/104 successful intended destinations at the recorded snapshot: 93 production, 11 preview                                                                                                                                                                                                                                                                                                                                                   |
| Account focused tests                  | 6 files / 46 tests passed; 2 additional existing style files / 8 tests passed                                                                                                                                                                                                                                                                                                                                                                  |
| Food/Progress focused checks           | 12 files / 114 tests passed; broader related actions/repositories/domain/sections batch 21 files / 151 tests passed; final recovery/link batch 2 files / 11 tests passed                                                                                                                                                                                                                                                                       |
| Training focused checks                | Template batch 17 tests, occurrences 10, scheduled page 5, setup job 2; earlier related batches 41 and 30 tests passed                                                                                                                                                                                                                                                                                                                         |
| Progress preview and shared views      | 15 tests passed; desktop/Android fixture queries and selector interactions passed after stable-server recheck                                                                                                                                                                                                                                                                                                                                  |
| Independent combined-change review     | 9 files / 65 tests passed across boundaries, labels, auth, templates and coaching guards                                                                                                                                                                                                                                                                                                                                                       |
| Inventory matcher                      | 5 Node tests passed; formatting and ESLint passed; older capture records also rechecked for streamed error boundaries                                                                                                                                                                                                                                                                                                                          |
| Account browser after fixes            | 12 onboarding layouts passed at desktop/mobile/320px/200% text; sign-out failure preserves drafts and retry succeeds; all resulting screenshots visually inspected                                                                                                                                                                                                                                                                             |
| History filter browser checks          | 6/6 passed: cycling, swimming and recovery retain their selected option; populated records match their kind; empty results show the explanation and Clear filters action                                                                                                                                                                                                                                                                       |
| Production build                       | Webpack production builds passed with TypeScript and route generation. Layout/Sheet build (`output/audit-2026-10-20/build-recheck.log`) received affected browser checks; the Food/boundary build (`output/audit-2026-10-20/build-food-scroll-fix.log`) passed both full Food workflows and fallback checks. The subsequent resize build (`output/audit-2026-10-20/build-resize-final.log`) received targeted strip and hydration regressions. |
| Repository lint/format/typecheck       | Exit 0 for lint (`output/audit-2026-10-20/lint-complete.log`), format (`output/audit-2026-10-20/format-complete.log`) and TypeScript (`output/audit-2026-10-20/typecheck-complete.log`); final changed harness files also passed scoped lint.                                                                                                                                                                                                  |
| Full repository Vitest suite           | **413/413 files, 3,432/3,432 tests passed**, exit 0 in 904.20s; complete log (`output/audit-2026-10-20/tests-final.log`). The new logging-preview, Sheet, eight food-strip, three save-refresh and three boundary cases passed separately: **3,448 unique tests across 415 files verified across completed runs**.                                                                                                                             |
| Final 28-suite browser/workflow matrix | **28/28 groups passed, zero skipped engines.** The final matrix retains initially passing groups and reruns all six failed groups against the rebuilt app; attempt history (`output/audit-2026-10-20/suite-results.json`). It is not presented as one uninterrupted run of one build.                                                                                                                                                          |

Focused batches overlap; their counts are not a unique total. Tests cover actionable failure
paths as well as happy paths: failed sign-out and retry, failed calendar read, malformed
dates, zero assistance, rich prescription preservation, missing repetitions, query changes
without remount, filtered empty history, invalid consent IDs and blocked preview writes.

Initial full-suite attempts encountered sandbox temporary-file errors, and the threads
pool later made no completed-file progress for more than 20 minutes. The successful full
run used workspace `TEMP`/`TMP`, `--pool=forks --maxWorkers=4 --reporter=verbose`; its complete
log records 413 files and 3,432 tests passed. The new logging-preview and Sheet regressions
were run separately after that run; the nine-test Sheet/preview transcript (`output/audit-2026-10-20/sheet-focused-tests.log`)
includes one new Sheet test and previously verified tests. The five Node harness regressions are separate from the Vitest
total. The latest responsive browser checks and their focused tests are also listed
separately, rather than presented as another completed full-suite run.

Additional completed browser evidence:

- OAuth approval and denial: 4/4 local flows across Android and iPhone, with callbacks intercepted before reaching an external provider.
- Responsive account identity/email/Appearance: 36/36 development checks, with the revised narrow and desktop layouts visually inspected.
- Coach change actions: 3/3 development viewport/action/revision cases, plus 13 focused component tests.
- Native date/time controls and coach selection: 12/12 development cases, no runtime/overflow/axe violations; 16 screenshots inspected.
- Unstar and missing-machine confirmations: 12/12 production checks, no runtime/overflow/axe violations; all screenshots inspected and cancellation proved not to mutate records.
- Android dark sweep: all 216 viewport captures visually inspected without a new dark-theme layout or contrast finding.

## Final browser rechecks and limits

- Account identity, email and Appearance: 36/36 production layouts (`output/audit-2026-10-20/identity-layouts-3110/results.json`).
- Native date/time fields and coach selection: 12 production layouts (`output/audit-2026-10-20/native-controls-production/results.json`) fit without overflow or axe violations. One WebKit background-request error did not reproduce in isolated rechecks (`output/audit-2026-10-20/native-controls-production-webkit-recheck/results.json`); original evidence remains.
- Real pending approval: 3/3 production cases (`output/audit-2026-10-20/change-actions-production/results.json`), including readable labels, reachable controls, revision form and zero mutation requests.
- Shared sheets: 20/20 keyboard cases (`output/audit-2026-10-20/sheet-keyboard-after-production/results.json`), using production for completed-session details and the development server for preview fixtures.
- Additional overlays and logger tabs: 48/48 cases (`output/audit-2026-10-20/extra-overlays/results.json`), including rest extension/stop, dismissals, return to Log and zero mutation requests while opening/dismissing read-only overlays.
- Coaching tabs and panels: 24 layout cases (`output/audit-2026-10-20/coach-panels-final-matrix/results.json`), plus final production UI-control checks in the matrix.

Outdated audit selectors for the former Training hub, strength intake and coaching help
were updated to assert the current flows, including sport isolation and real scrollable
help. The initial WebKit account timeout did not reproduce in diagnostic or unchanged full
reruns. Food navigation failures were reproduced and traced to the day strip moving the
document during a click. A later Food rerun found a save-refresh race that could keep the
old library visible after a successful save. Both product defects were fixed and checked
in the latest build. One overlay check was repeated after settling the previous page's requests
before navigation. Original failures and attempt history are retained. No forced clicks
were introduced to mask failures.

The nutrient disclosure check initially expected a pointer click to focus its opener in
WebKit. A six-case diagnostic (`output/audit-2026-10-20/food-macro-focus-final/results.json`)
confirmed pointer dismissal and genuine Tab/Enter/Escape focus restoration in both engines
after full page loads. Keyboard traversal starts at the calendar control; starting from the
dismissed pointer dialog could send WebKit focus into browser chrome, as recorded by the
focus trace (`output/audit-2026-10-20/food-webkit/macro-focus-trace.json`).
The final workflow checks pointer content/dismissal and keyboard restoration separately.

The route tables show that every screen template was reached and reviewed. They do not
represent exhaustive traversal of every data combination, permission permutation, expanded
sheet or network failure. Focused tests and workflow suites exercise selected meaningful
branches; linked final suite results identify the workflows exercised.

Authentication was simulated locally. No real recovery email was sent, no external coach
was dispatched, and no production OAuth grant/token was issued. Browser emulation covers
the configured desktop, Android and iPhone environments; it does not substitute for testing
every physical device, assistive technology or browser version.
