# Theme audit — 22 October 2026

Applied the 21 October direction in `DESIGN.md` across the app on branch
`codex/theme-all-screens`, created from local `main` at `7190d1fe`.

**All 85 production page templates have successful light and dark captures.** The
410 production screen checks passed with no recorded browser exceptions, axe WCAG
A/AA violations, or horizontal overflow. Both sets of 192 primary viewport captures
were visually reviewed, with additional onboarding, compatibility, form, sheet,
pending, failed-save, retry, and saved-state captures.

The [verification summary](2026-10-22-theme-verification.json) lists every production
route with separate successful cases for each theme. The local screenshot gallery is
`output/audit-theme-2026-10-22/index.html`.

## What changed

- Controls, selection, focus, ordinary statuses and offline notices stay neutral.
  Availability, comparison and completion labels no longer imply a successful save.
- Sport pigments remain on training marks, charts and sport progress. Food retains
  its ochre/cadmium treatment on food illustrations and data.
- Refused fields use the danger label, alert glyph, tint and edge. This includes
  native required controls, choices, scales, workout figures, lap inputs, food
  amounts, onboarding answers and password confirmation.
- Errors remain until the relevant value is valid. Unrelated edits do not remove a
  refusal. Failed requests preserve entered values and selected options.
- Save failures use the shared error presentation. Pinned sheet summaries connect
  to their form and identify the actual fields, including individual lap fields.
  Independent actions inside another form do not duplicate its field summary.
- Confirmed saves use the success treatment. Food confirmations sit above the
  navigation and active workout strip. Food retry repeats the failed operation,
  including removal, without switching it to a save.
- OAuth decisions now show pending states and an inline expected failure while
  preserving native form submission before JavaScript starts. The latest decision
  owns the error state, and authorization is checked again when submitting.

No new accent palette was introduced. Existing semantic tokens remain the source
for both appearances.

## Local data and environment

| Item                     | Configuration                                              |
| ------------------------ | ---------------------------------------------------------- |
| Production app           | `http://localhost:3101`                                    |
| Development previews     | `http://localhost:3100`                                    |
| Authentication simulator | `http://127.0.0.1:54322` for production                    |
| PostgreSQL               | Dedicated loopback database `overload_audit_theme`         |
| Baseline accounts        | **56**, before disposable onboarding accounts              |
| History                  | Six calendar months                                        |
| Runtime                  | Next.js 16.3.4, installed framework documentation reviewed |
| Primary captures         | Chromium, Pixel 7 viewport, both appearances               |
| Additional coverage      | Chromium desktop, WebKit phone viewport, 320px food sheets |

The baseline contains 909 activities, 386 workouts, 3,553 sets, 4,264 food entries,
281 body-weight readings, 232 recovery readings, 40 resources, 8 saved meals and
1,008 scheduled occurrences. These are initial fixture counts, not counts of
individually reviewed records. Mutation checks intentionally changed disposable
local records afterward.

The ten established personas include populated, empty, private and incomplete-setup
accounts. `seed-theme-audit.ts` adds 46 local accounts with varied units, time zones,
sharing settings and training data. The seed export records exactly 56 users. Later
setup tests create additional disposable users; Taylor's original setup state was
restored. Database reconciliation and cross-account access checks passed.

## Verification

| Check                       | Result and scope                                                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production screen inventory | **85/85 templates in light; 85/85 in dark**                                                                                                           |
| Route and state sweep       | **410 passed**: 384 main, 18 onboarding, 8 compatibility                                                                                              |
| Primary visual review       | All 24 contact sheets, 192 captures per appearance                                                                                                    |
| Measured color pairs        | **164 passed** across Chromium/WebKit and both modes; text ≥4.5:1, glyphs/edges ≥3:1                                                                  |
| Focused theme checks        | **48 records passed**, including contrast, inline/native refusal, offline, 404 and client errors                                                      |
| Training                    | 64 main assertions, 12 lap checks, 4 effort checks, 30 stable completion checks; final production action audit **20/20**, including database outcomes |
| Account and food            | 32 development captures; final production **10/10** states, plus the final two amount-surface checks                                                  |
| Plan and coach              | **14/14** interaction cases; **18** production onboarding screen cases, including refused actions                                                     |
| Password saves              | Both forms saved in both modes; a new sign-in verified each changed password, then restored the disposable user's original password                   |
| OAuth                       | Approve/decline pending and callback paths in both modes, plus native POST with JavaScript disabled; callbacks intercepted locally                    |
| Error boundary              | Online, offline-in-workout and offline-elsewhere previews in both modes                                                                               |
| Legacy routes               | **50/50** checks across Chromium and WebKit, including foreign/missing records, bookmark sign-in and onboarding guards                                |
| Production build            | Passed after final application changes                                                                                                                |
| TypeScript                  | `npm run typecheck` passed                                                                                                                            |
| Lint/format                 | Changed files passed ESLint and Prettier                                                                                                              |
| Automated tests             | Related tests passed in each affected area; overlapping batches are not summed                                                                        |

The root shared-component run passed 155 tests in 30 files. Subsequent changes
received focused regressions, including five form-summary tests and seven consent
tests. Training's related batches passed 271, 134 and 73 tests; plan/coach's later
related batches and account/food's focused corrective runs also passed. Their exact
run scopes are retained in the area reports.

Before the requested release, the full suite ran once: **3,711 passed and two
failed across 442 files** in 418 seconds. Both failures were asynchronous test
assertions running before React committed the result: the running-form watch-total
refusal and the privacy switch's dependent labels. The tests now await the relevant
update. Each failed case passed its focused rerun; no application code changed for
these corrections, and the already-passing suite was not repeated. All 3,713 cases
have passing evidence across the full run and these two corrected-case reruns.

The broad production sweep preceded the final isolated amount-field surface and
independent-action summary fixes. After rebuilding, the affected food and workout
fault states were recaptured successfully. Unchanged routes and already-passing
tests were not rerun routinely.

The legacy audit initially expected the old accessible name `Plan`; the current
back link is named `Back to Plan`. The harness was corrected, and only its ten
failed cases were rerun. Both the initial result and the corrected aggregate are
retained. The contrast harness initially misread shorthand white (`#fff`); its
parser was corrected and only the uncompleted light-mode cases were run again.

## Evidence

All raw evidence is local under `output/audit-theme-2026-10-22/`:

- `index.html`: searchable screenshot gallery.
- `route-inventory.json`, `screens-android.json`, `screens-android-dark.json`:
  production templates, exact requests, destinations, screenshots and accessibility results.
- `screens-onboarding-*.json`, `screens-compatibility-*.json`: supplemental route states.
- `contacts/`, `dark-contact-review.json`, `plan-coach/light-contact-review.json`:
  complete primary viewport review.
- `theme/results.json`: browser/theme checks and measured contrast ratios.
- `training/report.json`, `training/production-buttons-results.json`,
  `training/production-button-db.json`: workout/activity failures, retry and persisted outcomes.
- `account-food/summary.json`, `account-food/production/`: account and nutrition states.
- `plan-coach/audit-report.json`, `plan-coach/onboarding-results-production.json`:
  builder, gym, coaching and setup coverage.
- `password-saves/results.json`, `supplemental/results.json`: password persistence,
  local OAuth, native POST and error-boundary states.
- `legacy-routes/final-results.json`: initial passing cases plus corrected failed cases.
- `theme-users.json`, `database-check.log`: 56-user seed and database checks.
- `build.log`, `typecheck-final.log`, `lint-final.log`, `format-final.log`: static/build checks.
- `release-tests.log`: the single pre-push full-suite run, including its two initial failures.

Development hot-reload/router diagnostics encountered during parallel edits are
preserved in the original evidence. Stable production captures were used for the
app-wide conclusions. Development-only previews are reported separately from the
85 production pages.

All **13 development-only preview templates** were also captured in both themes
and visually reviewed. The 26 initial visits had no axe violations, overflow or
unexpected error screens. Six route/theme combinations initially emitted development
runtime diagnostics during cold startup; only those cases were rechecked after
warming the server, and all six were clean. The original diagnostics remain in
`plan-coach/preview-results.json`. The relevant preview sources have no branch
diff, but the original diagnostic stacks were not recorded, so their precise cause
is not established.

## Reproducing the local audit

Use a dedicated local database. The seed and audit runners reject non-loopback
database targets. In PowerShell, the main setup sequence is:

```powershell
$env:AUDIT_DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:5432/overload_audit_theme'
$env:AUDIT_OUTPUT_DIR = 'output/audit-theme-2026-10-22'
$env:AUDIT_HISTORY_MONTHS = '6'
$env:AUDIT_EXTENDED_PERSONAS = 'true'
node scripts/dev/audit.mjs setup
npx tsx scripts/dev/seed-theme-audit.ts
$env:DATABASE_URL = $env:AUDIT_DATABASE_URL
npx tsx src/db/backfill-multisport.ts
node scripts/dev/audit.mjs verify-db
```

Run the local auth simulator and production app with matching `AUDIT_AUTH_PORT`
and `AUDIT_PORT` values through `audit.mjs auth`, `build`, and `start` in separate
terminals. The optional local consent fixture also needs the seeded owner's ID and
local OAuth client ID through `AUDIT_COACH_BACKUP_OWNER_ID` and
`AUDIT_COACH_BACKUP_CLIENT_ID` during auth, build and start.

```powershell
$env:AUDIT_BASE_URL = 'http://localhost:3101'
$env:AUDIT_DEVICE = 'android'
$env:AUDIT_CAPTURE_VIEWPORT = 'true'
$env:AUDIT_THEME = 'light'
node scripts/dev/audit-browser.mjs
$env:AUDIT_THEME = 'dark'
node scripts/dev/audit-browser.mjs
Remove-Item Env:AUDIT_THEME
node scripts/dev/audit-theme.mjs
node scripts/dev/audit-inventory.mjs
```

The supplemental setup/compatibility fixtures and fault harnesses used for this
run are retained with the local evidence. The generic screen sweep alone does not
create all of those additional state fixtures.

## Verification limits

Authentication and coach states used local simulators or fixtures. Real email
delivery, external OAuth grants and live coach-provider handoff were not exercised.
OAuth callbacks were intercepted locally, and queued coach fixtures were prevented
from dispatching externally. Screen coverage and representative fault checks do
not establish every possible input or failure permutation.
