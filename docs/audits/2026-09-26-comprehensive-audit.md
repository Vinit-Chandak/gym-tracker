# Comprehensive local and mobile audit — 26 September 2026

The audit branch, `audit/comprehensive-mobile-56-months`, starts from `origin/main` at
`1048d74`. It includes the local environment, repeatable data generation, browser audit
scripts, application fixes and regression tests. It does not require a hosted Supabase
database or an external coach worker.

## Environment and data

See [Reproducing the 56-month local audit](local-56-months.md) for setup, credentials,
isolation guarantees and the initial record counts. Six accounts cover established metric
and imperial athletes, private sharing, unfinished workouts, empty states and onboarding.
Four established athletes have all four sports, food, body weight and recovery across
56 calendar months: February 2022 through September 2026.

The audit app uses a separate `.next-audit` build, port 3101, local auth on 54323 and the
`overload_audit_56months` database. Existing development servers and environment files remain
in place. Database URL guards reject remote hosts, unapproved database names and query-string
overrides. The local auth stand-in verifies signed tokens, issuer, audience and expiry, and
supports password changes, refresh rotation, logout and deletion.

Fresh-database replays verify migration setup, all 56 months, RLS isolation, activity/workout
reconciliation, programme scheduling, sharing projections and seed idempotence. A second seed
adds no duplicate history and preserves edits. A separate first-of-month replay verifies
coverage even when the final month contains only one day.

## Screen and interaction coverage

The screen audit opens 144 route/persona states per configuration. It includes:

- Sign-in and all onboarding stages; Today, day selection and empty states.
- Active/completed workouts, check-in, exercise logging, substitution and completion.
- Running, cycling and swimming creation/correction, templates, scheduled occurrences and
  programme screens.
- Food overview, all six meals, targets, saved foods and saved meal creation/editing.
- Progress sections, recovery, charts, history and supported yearly windows covering the
  entire 56-month seed.
- Profile, units, sports, privacy, password/deletion, gyms and equipment.
- Programme creation/manual editing, drafts, proposals, job states and routines.
- People search, followers, public profiles, comparison, leaderboards and private data states.

Each sweep records HTTP status, unexpected not-found pages, uncaught browser errors, page
content and horizontal overflow against the actual layout viewport. Android sweeps also run
automated accessibility checks. Focused probes inspect text bounds, touch targets, native
selectors, modal focus, body scroll restoration, keyboard-sized viewports and expanded chart
tables. Both light and dark themes and 200% text are exercised.

Browser workflow suites submit actual forms to the local production build and verify saved
database state. They cover account onboarding and deletion, unit conversion, gyms/equipment,
privacy and follow approval; strength workout save/retry/delete/finish; all endurance sports,
templates and scheduling; food snapshots, meals, targets and retry idempotence; and recovery
checks, history filters and charts. Offline and concurrent-edit cases distinguish unsaved
drafts, lost replies and stale versions. PWA checks cover the manifest, service worker,
installation help and private-cache boundaries.

## Fixed application defects

### Workouts, schedules and data correctness

- A combined lifting/running day could start its completed lifting part again while the run
  remained pending. Starting now resolves the pending lifting part, and the chooser labels
  the next cycle or a deliberately reopened skipped workout accurately. Stale programme
  links return to the current plan; rest-day actions validate the actual day type. When a
  programme begins partway through a cycle, earlier days correctly offer their next cycle's
  workout without inventing a workout before the programme began.
- Lifting adherence counted the combined day status instead of the lifting part. It now
  reports completed and skipped lifting independently of the run.
- Adding or substituting an exercise accepted stale or incompatible selections. The server
  now checks active visible exercises and equipment compatibility within the session's gym.
- A stale set-delete request could remove a newer edit of that set. The displayed saved
  version is checked under the transaction lock; retrying an already successful delete is
  harmless.
- Completed timed sets and carries showed the wrong effort field. Read-only tables now
  retain RPE, seconds/metres and mixed-measure or mixed-unit rows as recorded.
- Negative duration components could offset positive components and pass aggregate
  validation. Each component is now validated independently, including swimming active time.
- Generic activity deletion could bypass the strength workout lifecycle and leave programme
  state inconsistent. Strength deletion is kept in the workout's own lifecycle.
- Malformed history cursor UUIDs and out-of-range dates could reach database parsing. Invalid
  cursors now fail safely.
- Changing a profile time zone could move historical running volume or rebuilt shared
  endurance statistics to different days/weeks. Those calculations retain the recorded local
  dates. Re-enabling sharing rebuilds the entire history in bounded batches after checking
  consent; it does not truncate to a display limit.
- URL changes could leave history filters, programme tabs and follower lists showing stale
  selections. Those controls now follow the current URL/server state.
- Cycling and swimming comparisons showed lifting sections, some social links discarded the
  selected sport/period, and leaderboard help described running for other endurance sports.
  These sections, links and explanations now retain the selected sport's meaning.
- A disconnected workout-start request replaced the usable page with an error. Today and
  its menu now retain a retryable error and the current selection.
- Opening the old running tab or unplanned run logger streamed the navigation shell before
  redirecting, allowing WebKit prefetch requests to race the redirect. These simple aliases
  now redirect before rendering. Links naming a saved plan or legacy run retain their
  authenticated identifier lookup.
- Signing in from a sport, scheduled-session or filtered-history link discarded its query
  parameters. The complete internal destination now survives sign-in, while the framework's
  prefetch key is removed and the existing same-origin validation remains in force.

### Mobile layout and controls

- Shared cards and row groups have visible, consistent boundaries in both themes.
- Sheets size themselves to the visual viewport, use one scroll region when space is tight,
  preserve page scroll, handle nested dialogs and avoid duplicate close callbacks. Pending
  confirmations cannot be dismissed accidentally.
- At a short keyboard viewport, collapsing heading margins caused the food sheet to switch
  layout every frame, moving its submit button. The heading now contains its margins and
  remains stable across compact and expanded layouts.
- Segmented choices, shortcuts, headers, fields, muscle checkboxes, badges, ranking rows,
  comparison values and chart legends wrap within narrow screens at enlarged text sizes.
- Programme, routine and custom-exercise dropdowns use the shared native select control.
  Fields and filter triggers have accessible names, and optional duration error groups open
  to reveal the invalid input.
- Tooltip position updates after viewport changes, and Escape closes the active note without
  unexpectedly dismissing its containing sheet.
- People and username searches recover from network failures without applying stale results;
  the rest timer still works when browser storage is unavailable.
- Programme exercise search clears a stale selected result when the query changes, and
  invalid week counts cannot trigger unbounded form-row generation.
- Workout set options use an adaptive grid: numeric values stay visible and their increment,
  decrement and type controls retain 44-pixel touch targets at 320 pixels with 200% text.

## Verification

| Check                                            | Result                                                                                                                                                                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production build                                 | Passed against the isolated database/auth configuration.                                                                                                                                                                         |
| TypeScript                                       | Standard route generation/typecheck and audit typecheck passed.                                                                                                                                                                  |
| ESLint and Prettier                              | Repository checks passed.                                                                                                                                                                                                        |
| Full Vitest suite                                | 1,648 tests passed across 215 files.                                                                                                                                                                                             |
| Final regression pass                            | All 78 chooser, scheduling, redirect, authentication and legacy-lookup tests passed after the final fixes.                                                                                                                       |
| Route/persona sweeps                             | All 1,008 screen checks passed across seven configurations, including iPhone dark mode with 200% text and expanded disclosures; zero runtime errors, overflow, unexpected not-found pages or automated accessibility violations. |
| Focused mobile controls                          | 60 route/state cases and 22 menu checks passed across Chromium/WebKit, including short keyboard viewports and 200% text.                                                                                                         |
| Account workflows                                | 20 passed across Android Chromium and iPhone WebKit.                                                                                                                                                                             |
| Login-return bookmarks                           | Eight passed across Chromium/WebKit, retaining the selected sport and exact occurrence after sign-in.                                                                                                                            |
| WebKit legacy aliases                            | All 18 targeted visits passed after early redirects, with zero runtime errors or failed/canceled requests.                                                                                                                       |
| Programme/routine workflows                      | 18 passed across both engines.                                                                                                                                                                                                   |
| Strength workout workflows                       | 22 passed across both engines.                                                                                                                                                                                                   |
| Endurance, scheduling, sharing and PWA workflows | 40 passed across both engines.                                                                                                                                                                                                   |
| Food workflows                                   | 34 passed across both engines, including strict viewport-width and short-keyboard checks.                                                                                                                                        |
| Recovery workflows                               | 24 passed across both engines, including full and partial answers, edits, filters, charts and light/dark narrow layouts.                                                                                                         |
| Complete monthly history                         | 224 account/month windows passed; all 4,429 displayed records matched independent database queries exactly.                                                                                                                      |
| History interaction and preservation             | 20 date transitions and 20 sport-filter checks passed; all four account fingerprints remained unchanged.                                                                                                                         |
| Local auth                                       | 17 sign-up, credentials, token verification, refresh, logout and deletion checks passed.                                                                                                                                         |
| Local-only connection guards                     | 36 rejection cases plus six history-audit and six bookmark-audit cases passed.                                                                                                                                                   |
| Seed replay and final database check             | Fresh normal and first-of-month replays passed. Final database has six users, no chronology/projection discrepancies, and all 13 fixture/RLS checks pass.                                                                        |

The full unit suite ran before the final chooser and login/redirect adjustments; the focused
78-test pass and production build include those changes. Browser workflow assertions check persistence,
identity and isolation as well as the visible result. Monthly history expectations come from
uncapped read-only SQL rather than the application repositories.

Commands and environment variables are in the [local runbook](local-56-months.md). The durable
browser entrypoints are `audit:screens`, `audit:account`, `audit:programme`, `audit:bookmarks`, `audit:workout`,
`audit:flows`, `audit:food`, `audit:recovery` and `audit:history`; `audit:db` checks the current
database. The full test command used was
`node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=verbose`.

Generated screenshots and detailed JSON stay under `output/audit-56-months`, which is ignored
by Git. The scripts and this report are committed so the checks can be repeated. Browser suites
that create disposable account, programme, workout or recovery fixtures remove those accounts
afterward. The activity and food suites intentionally exercise the initially empty Sam persona;
use a fresh audit database for a pristine empty-state replay.

## Limits

Chromium with Android device settings and WebKit with iPhone settings were exercised locally.
These checks do not substitute for a physical-device pass of the installed PWA, operating
system keyboard, VoiceOver/TalkBack or native date/select pickers. Automated accessibility
checks cannot establish complete accessibility. Email delivery and live external coach
generation require their real integrations; local fixtures cover their visible states and
the application's surrounding workflows.
