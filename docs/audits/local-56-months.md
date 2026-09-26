# Reproducing the 56-month local audit

This stack uses PostgreSQL 17 already installed on the machine and a loopback Supabase Auth
stand-in. It keeps its database, app build, server ports and output separate from ordinary
development. No hosted database or real email/coach service is needed.

## Start the isolated stack

From the repository root, set these variables in each PowerShell terminal used for the audit:

```powershell
$env:AUDIT_DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:5432/overload_audit_56months'
$env:AUDIT_PORT = '3101'
$env:AUDIT_AUTH_PORT = '54323'
$env:AUDIT_OUTPUT_DIR = 'output/audit-56-months'
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

Open `http://localhost:3101`. The auth server listens on `127.0.0.1:54323`; PostgreSQL remains
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

| Username   | State                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| `vinit`    | Metric units, Kolkata time zone, established history, accepted and pending follows, coaching proposals         |
| `shreyash` | Metric units, approval required for follows, strength/running shortcuts with retained cycling/swimming history |
| `priya`    | Metric units, greater running frequency, body weight kept private, pending follow request                      |
| `alex`     | Pounds, miles, yards and New York time zone; private training; an unfinished workout; DST boundary records     |
| `sam`      | Onboarding complete, empty training and nutrition states                                                       |
| `taylor`   | New account still in onboarding                                                                                |

The four established accounts have data in every one of 56 consecutive calendar months. With
the audit's 26 September 2026 anchor, that is **1 February 2022 through 26 September 2026**.
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

The initial six-person dataset, before browser tests create disposable accounts or log more data:

| Record                                              |  Count |
| --------------------------------------------------- | -----: |
| Activities                                          |  3,314 |
| Strength sessions, including one unfinished session |  1,597 |
| Sets                                                | 14,488 |
| Food entries                                        | 20,728 |
| Body-weight readings                                |  1,122 |
| Standalone recovery readings                        |  1,116 |
| Saved meals                                         |      4 |
| Bike/pool/trainer/venue resources                   |     20 |
| Scheduled occurrences                               |    100 |
| Ready coaching proposals                            |      3 |

History identities and submission receipts are stable. Each completed account-month is recorded
after its transaction commits. Re-running the seed adds no duplicate history and preserves later
interactions, including completed workouts and reviewed proposals. The original account seed
also leaves existing accounts alone. For a pristine replay, choose another loopback database
such as `overload_audit_56months_replay` and a separate output folder.

## Verify and inspect

```powershell
npm run audit:db
$env:AUDIT_BASE_URL = 'http://localhost:3101'
npm run audit:screens
npm run audit:account
npm run audit:programme
npm run audit:history
npm run audit:bookmarks
```

The default screen audit runs Android, iPhone, 320-pixel narrow and desktop configurations.
Set `AUDIT_DEVICE` to select `android`, `iphone`, `narrow` or `desktop`; `AUDIT_THEME=dark`
selects dark mode. `AUDIT_FONT_SIZE=32` doubles the normal text size, and
`AUDIT_EXPAND_DETAILS=true` opens chart tables and other disclosures. The full audit also ran
Android dark, narrow light with doubled text and open disclosures, and iPhone dark with
doubled text and open disclosures. Clear these overrides before returning to the defaults.

`audit:workout`, `audit:flows` and `audit:recovery` exercise saved data and offline/retry flows.
They default to Android; run again with `AUDIT_DEVICE=iphone` for WebKit. `audit:food` uses
`AUDIT_BROWSER=chromium` by default and `AUDIT_BROWSER=webkit` for the iPhone pass. The account,
programme and bookmark audits run both engines by default.

The database verification runs the existing multisport and programme schedule audits, then checks
all 56 months per sport/person, food, weight and recovery coverage, workout/activity chronology, consent-aware
shared projections, latest body weight, and each account's inability to read another account's
raw activities, food or profile through the application's actual RLS transaction boundary.

`output/audit-56-months/fixtures.json` contains dynamic IDs for accounts, gyms, equipment,
activities, workout exercises, occurrences, templates, proposals, foods, saved meals and resources.
`history.from` and `history.to` define the seeded calendar window. `seed-verification.json` holds
the checks and current counts. Screenshots and browser reports use the same output directory.
The app intentionally limits each date-range query. Inspect yearly summaries, then use monthly
date windows in Progress History. History shows a truncation notice when the range is too broad
and asks for narrower dates; it does not have a load-more control. The read-only history audit
compares all 224 month/person windows with the database.

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
