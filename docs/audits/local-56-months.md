# Reproducing the 56-month local audit

The current checkpoint is the [29–30 September 2026 comprehensive audit](2026-09-29-comprehensive-audit.md).
The [26 September report](2026-09-26-comprehensive-audit.md) and its evidence remain available
as a separate historical checkpoint.

The complete 26-job browser/database matrix passed on source
`62bd09ef7dccca0405ddf64d5b66ee650698d298`, with 1,078 screen visits and 266 workflow checks.
The later coaching guardrail correction is committed as
`67ad25b4b9a65fcfb21b82706dae3380a0218f2d`. That final source passed 1,857 tests across 230 files,
static checks, the production build, the full coach simulation and repeated programme/database
checks. The comprehensive report keeps each validation stage tied to its tested source.

This stack uses PostgreSQL 17 already installed on the machine and a loopback Supabase Auth
stand-in. It keeps its database, app build, server ports and output separate from ordinary
development. No hosted database or real email/coach service is needed.

## Start the isolated stack

From the repository root, set these variables in each PowerShell terminal used for the audit:

```powershell
$env:AUDIT_DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:5432/overload_audit_20260929'
$env:AUDIT_PORT = '3102'
$env:AUDIT_AUTH_PORT = '54324'
$env:AUDIT_BASE_URL = 'http://localhost:3102'
$env:AUDIT_OUTPUT_DIR = 'output/audit-2026-09-29'
$env:AUDIT_SEED_THROUGH = '2026-09-29'
```

These are deliberately local test credentials. The database account must be able to create an
audit database and install the application's migrations. Install dependencies with `npm ci`
and browser engines with `npx playwright install chromium webkit` if they are not present.

```powershell
npm run audit:setup
npm run audit:build
npm run audit:auth   # leave running in terminal 1
npm run audit:start  # leave running in terminal 2
```

Open `http://localhost:3102`. The auth server listens on `127.0.0.1:54324`; PostgreSQL remains
on `127.0.0.1:5432`. The audit build uses `.next-audit` and `tsconfig.audit.json`. Rebuild with
the same variables after changing the public auth port, because Next.js embeds public
environment variables during a production build.

The runner passes database/auth overrides in the child process environment. It leaves existing
`.env` files, the ordinary `.next` build and the servers on ports 3100/54321 alone. Database names
must match `overload_audit` or an underscore suffix, and the host must be loopback. External coach
dispatch is disabled; ready, failed and waiting coaching states are local fixtures.
Database URLs must have no query string or fragment: PostgreSQL connection options in a query
could otherwise override a validated host or database name. The runner, auth stub, seed commands
and browser audits reject these overrides before connecting.

## Accounts and coverage

All six seeded accounts use the password `password123` and the email `<username>@local.test`.
The states below describe the fresh seed. After the mutation suites, Sam has intentional
workflow records; create a fresh replay database to restore pristine empty states.

| Username   | State                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| `vinit`    | Metric units, Kolkata time zone, established history, accepted and pending follows, coaching proposals         |
| `shreyash` | Metric units, approval required for follows, strength/running shortcuts with retained cycling/swimming history |
| `priya`    | Metric units, greater running frequency, body weight kept private, pending follow request                      |
| `alex`     | Pounds, miles, yards and New York time zone; private training; an unfinished workout; DST boundary records     |
| `sam`      | Onboarding complete, empty training and nutrition states                                                       |
| `taylor`   | New account still in onboarding                                                                                |

The four established accounts have data in every one of 56 consecutive calendar months. With
the audit's 29 September 2026 anchor, that is **1 February 2022 through 29 September 2026**.
The first run records the anchor in `auth.local_audit_seed_state`. Subsequent runs keep it fixed.
`AUDIT_SEED_THROUGH=YYYY-MM-DD` may select a past anchor when creating a fresh audit database;
changing the anchor of an already seeded database is refused.
Anchors on the first or second day of a month are supported. Missing sports get distinct
submissions on the last available day, and standalone recovery gets one reading there, so all
56 months remain covered without creating history after the requested anchor.

Strength sessions include warm-ups, working sets, timed core work, loaded carries, supersets,
progressing loads and complete/partial/absent recovery answers. All workouts have canonical
activity parents with matching dates/durations. Running includes outdoor and treadmill sessions;
cycling includes unknown and explicitly zero distance; swimming includes pool lengths, yards,
metres, unknown active time and open-water examples. Standalone recovery readings are included
on rest days. Food covers partial nutrition facts, unlogged days, saved meals and food snapshots.
Resources include active pools, bikes, trainers, venues and an archived pool referenced by history.

The verified database snapshots before and after the completed browser workflows:

| Record                            | Before workflows | After workflows |
| --------------------------------- | ---------------: | --------------: |
| Users                             |                6 |               6 |
| Activities                        |            3,315 |           3,325 |
| Strength sessions                 |            1,597 |           1,597 |
| Sets                              |           14,488 |          14,488 |
| Food entries                      |           20,760 |          20,768 |
| Body-weight readings              |            1,123 |           1,123 |
| Standalone recovery readings      |            1,120 |           1,120 |
| Saved meals                       |                4 |               6 |
| Bike/pool/trainer/venue resources |               20 |              20 |
| Scheduled occurrences             |              100 |             102 |

The initial fixture also includes one unfinished strength session and three ready coaching
proposals. Both database snapshots passed all 13 fixture/RLS checks; browser writes explain the
changed counts. Disposable accounts were removed, leaving the six seeded users.

History identities and submission receipts are stable. Each completed account-month is recorded
after its transaction commits. Re-running the seed adds no duplicate history and preserves later
interactions, including completed workouts and reviewed proposals. The original account seed
also leaves existing accounts alone. For a pristine replay, choose another loopback database
such as `overload_audit_20260929_replay` and a separate output folder.

## Verify and inspect

```powershell
npm run audit:db
npm run audit:all
```

`audit:all` runs 26 jobs: the database check, seven screen configurations, historical coverage,
account/programme/bookmark/legacy-route/UI-control/activity-time workflows, both engines'
workout/endurance/recovery/food/quick-food workflows, and a final database check. Read-only
screen sweeps run two at a time; mutation suites run sequentially because some deliberately
mutate the same local personas. It writes `suite-results.json` and one log per suite under
`suite-logs/` in the output directory. A suite failure is recorded and does not hide later
suite results; the aggregate command exits unsuccessfully if any selected suite failed.

The completed run's `suite-results.json` records all **26/26 jobs passing**. Its seven screen
reports contain **154 successful visits each, 1,078 total**, and its workflow reports contain
**266/266 passing checks**. The history report contains **244/244 monthly windows** (224 on
Chromium and 20 WebKit samples) plus **20/20 native filter checks**. The current comprehensive
report lists the exact per-workflow counts and screen configurations. These results belong to
source `62bd09ef7dccca0405ddf64d5b66ee650698d298`; the later guardrail follow-up is tracked separately.

For individual suites:

```powershell
npm run audit:screens
npm run audit:account
npm run audit:programme
npm run audit:history
npm run audit:bookmarks
npm run audit:legacy-routes
npm run audit:ui-controls
npm run audit:quick-food
npm run audit:activity-time
```

The separate coach simulation runs a local reference worker against isolated PGlite data,
without calling an external model. The default run covers all 24 personas for 28 simulated days:

```powershell
$env:SIM_OUT = 'output/audit-2026-09-29/coach-simulation'
npm run sim:coach
```

The current simulation exposed a runtime guardrail defect after the browser matrix: retaining
approved rep targets at coarse load steps could be incorrectly rejected as a new increase
using spent evidence. The committed fix preserves the bounded approved baseline and still
requires fresh evidence for a further increase. It also fixes Windows report filenames,
spent-citation retry holds and explicit superseded-job classification in the simulator.
Its 42 focused tests, final 1,857-test suite, ESLint, type checking, production rebuild and
three affected programme/database jobs passed. The full simulation passed all 24 personas
over 28 days: 945 work records (941 distinct jobs), with zero unexpected refusals or other
findings. Its 24 deliberate review refusals and five confirmed superseded queue entries are
documented in the simulation report. The separate browser rerun writes to
`output/audit-2026-09-29/coach-guardrail-regression/`, leaving the completed 26-job matrix untouched.

Run a selected part of the aggregate suite without rebuilding or reseeding:

```powershell
$env:AUDIT_SUITE_FILTER = '^(ui-controls|quick-food-)'
npm run audit:all
Remove-Item Env:AUDIT_SUITE_FILTER
```

After a completed run, rerun only failed jobs against the same stack with
`$env:AUDIT_SUITE_RETRY_FAILED = 'true'; npm run audit:all`. The aggregate retains earlier
attempts and their logs, and updates the final result. Clear `AUDIT_SUITE_RETRY_FAILED`
before starting a fresh audit; use a fresh database when a failed mutation suite requires
pristine fixtures.

The default screen audit runs Android, iPhone, 320-pixel narrow and desktop configurations.
Set `AUDIT_DEVICE` to select `android`, `iphone`, `narrow` or `desktop`; `AUDIT_THEME=dark`
selects dark mode. `AUDIT_FONT_SIZE=32` doubles the normal text size, and
`AUDIT_EXPAND_DETAILS=true` opens chart tables and other disclosures. The aggregate audit includes
Android dark, narrow light with doubled text and open disclosures, and iPhone dark with
doubled text and open disclosures. Clear these overrides before returning to the defaults.

The current expanded route list produced 154 passing visits per configuration in the completed
seven-configuration matrix, with no failed screen checks. It includes
Food, Breakfast, Lunch and Dinner at `fixtures.history.to`, keeping populated nutrition screens
in the audit even after the current date passes the fixed seed anchor. Per-visit evidence is in
the seven `screens-*.json` reports; route-template inventory is recorded separately.

`audit:workout`, `audit:flows` and `audit:recovery` exercise saved data and offline/retry flows.
They default to Android; run again with `AUDIT_DEVICE=iphone` for WebKit. `audit:food` uses
`AUDIT_BROWSER=chromium` by default and `AUDIT_BROWSER=webkit` for the iPhone pass. The account,
programme, bookmark, legacy-route, UI-control and activity-time audits run both engines by default.

`audit:ui-controls` checks help notes, keyboard-sized viewports, enlarged text, native selects,
chart touch tooltips, filter sheets, appearance changes across tabs and blocked storage, and
the workout Resume touch target. At 320 px it measures heading/link/food text geometry at normal
and doubled text sizes, including light/dark food summaries, logged foods, saved meals, macro
breakdowns and week/month calendar markers. These checks catch labels compressed into letter
columns and calendar markers leaving their cells even when the page itself has no overflow.
`audit:quick-food` uses a disposable account and leaves the
six seeded personas intact. It checks optional names, validation, selected-day logging,
saved-food isolation, committed-response loss and retry, portion correction/removal, and
responsive dialogs. It defaults to Chromium; set `AUDIT_BROWSER=webkit` for its iPhone pass.
The broader `audit:food` runner resets Sam's nutrition fixtures, so use a fresh replay database
when pristine before/after fixture counts are needed.

`audit:activity-time` creates and removes a disposable account per engine. It tests spring-forward
gaps, the native required choice for repeated local times, server rejection of missing choices,
exact first/second UTC persistence, narrow light/dark layouts and corrections after changing the
profile time zone. It runs Chromium and WebKit by default; `AUDIT_BROWSER=chromium` or `webkit`
selects one. It passed 14/14 checks in the completed aggregate. Results go to
`activity-time/results.json` under the output directory.

`audit:legacy-routes` is read-only and uses the seeded Vinit and Taylor accounts. It repeats both
legacy detail and edit links ten times on WebKit and five times on Chromium, asserting HTTP 307
and the exact Location before the destination renders. It also checks missing/foreign IDs,
unavailable planned links, useful 404s, sign-in return destinations and the incomplete-onboarding
gate. The application resolves these aliases in a bare authenticated route group, without the
main tab shell or loading boundaries, so resolving a redirect cannot start navigation prefetches.
It passed 50/50 checks in the completed aggregate with no uncaught page errors; results are saved to
`legacy-routes/results.json`.

The database verification runs the existing multisport and programme schedule audits, then checks
all 56 months per sport/person, food, weight and recovery coverage, workout/activity chronology, consent-aware
shared projections, latest body weight, and each account's inability to read another account's
raw activities, food or profile through the application's actual RLS transaction boundary.
Inspect the programme schedule diagnostic text as well as the exit status: that CLI does not
fail its process when it reports findings. In the completed before/after checks, multisport
reported no issues and all four programmes in each snapshot reported `findings: none`.

`output/audit-2026-09-29/fixtures.json` contains dynamic IDs for accounts, gyms, equipment,
activities, workout exercises, occurrences, templates, proposals, foods, saved meals and resources.
`history.from` and `history.to` define the seeded calendar window. `seed-verification.json` holds
the checks and current counts. Screenshots and browser reports use the same output directory.
The app intentionally limits each date-range query. Inspect yearly summaries, then use monthly
date windows in Progress History. History shows a truncation notice when the range is too broad
and asks for narrower dates; it does not have a load-more control. The read-only history audit
compares all 224 month/person windows on Chromium and 20 sampled windows on WebKit with the
database, then checks 20 native sport filters. All 244 windows and 20 filters passed in the
completed matrix, with raw history unchanged.

These are browser-engine emulations of Android Chrome and iPhone Safari. Native HTML date,
time, select, radio, checkbox and dialog controls are used where appropriate. Physical-device
keyboard behavior, operating-system pickers, screen-reader behavior and installed-PWA behavior
still need checks on real devices. Local auth and seeded coaching states do not verify live
Supabase email delivery or a production external coach worker.

## Earlier 26 September evidence

The results below belong to the 26 September checkpoint and the earlier database/output paths.
They are retained for reproducibility; the latest report records the new run separately.

A second fresh database, `overload_audit_56months_verify`, was built from migrations and seeded
on 26 September 2026. Its second seed inserted zero account-months, retained the same 3,314
activities and 1,597 workouts, and passed all database/RLS checks. Its evidence is in
`output/audit-56-months/reproducibility/seed-verification.json`.
An additional retry check compared counts and sorted identity hashes across eleven tables and
confirmed that a tester's edited food name survived reseeding. That evidence is
`output/audit-56-months/reproducibility/seed-idempotence.json`.

A fresh early-month replay, `overload_audit_56months_short`, used `AUDIT_SEED_THROUGH=2026-09-01`
and passed all 13 fixture checks, including 56-month coverage for every sport and all three
daily log types. Its second seed again added zero account-months or boundary fixtures. It contains
3,273 activities, 1,573 strength sessions, 20,424 food entries, 1,110 body-weight readings and
1,104 standalone recovery readings; its evidence is
`output/audit-56-months/early-month/seed-verification.json`.

The account browser audit creates and removes its own uniquely named `auditac...@local.test`
accounts. It runs Android Chromium and iPhone WebKit sequentially through signup, both onboarding
paths, imperial profile conversions, validation, gym/equipment edits and archiving, privacy
preferences, follow requests, password changes, sign-out/re-login and account deletion. It checks
persistence and deletion cascades against the isolated database and records screenshots and
runtime errors in `output/audit-56-months/accounts/results.json`. The six shared personas are
left intact. Set `AUDIT_DEVICE=android` or `iphone` to run one engine.
The account suite passed all 20 browser workflows across both engines with no runtime errors.

The programme suite exercises custom machine-exercise validation, manual programme building,
day ordering, draft save/reload/edit, preview and activation, saved routine launch/reuse, and
programme-change decisions. Its guarded fixture helper copies local proposal metadata onto each
`auditpr...@local.test` account's own active programme. Accepting, declining and requesting revisions
therefore leave the shared personas intact and never start a coach worker. Results and screenshots
are written to `output/audit-56-months/programme/`.
All 18 programme workflows passed across Android Chromium and iPhone WebKit with no runtime errors.

The bookmark audit uses fresh signed-out browser contexts. It verifies that legacy run links,
sport selections and the exact scheduled occurrence survive sign-in, and that framework
prefetch keys are omitted from the return URL. All eight checks passed across Chromium and
WebKit; results are in `output/audit-56-months/bookmarks/results.json`.

The auth stub was separately checked against 17 sign-up, password, signed-token, forged-token,
refresh, logout and account-deletion cases. It verifies ES256 signatures, issuer, audience and
expiry, rejects weak password updates, and refuses non-local databases. That report is
`output/audit-56-months/auth-verification.json`. Recovery email requests are acknowledged locally;
email delivery and a real external coach worker remain outside this local stand-in.
An additional 36 rejection checks cover query overrides, fragments, remote hosts and unrelated
databases across the local runner, auth, seed and account-audit entrypoints; all passed. The
report is `output/audit-56-months/local-guard-verification.json`.
