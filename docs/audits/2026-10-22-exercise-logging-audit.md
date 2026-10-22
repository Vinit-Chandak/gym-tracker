# Exercise logging audit — 22 October 2026

Audited and repaired running, cycling, swimming and strength logging on
`audit/exercise-logging`, created from `main` at `3466a83e`.

The latest scoped browser checks pass: **40 Chromium cases and 40 WebKit cases**,
combined across the initial runs and targeted follow-ups. These are different sets:
Chromium includes the planned interval run; WebKit includes the full retrospective
substitution scenario. Both include 24 endurance layout/accessibility combinations.
The [verification summary](2026-10-22-exercise-logging-verification.json) records the cases.

## Repairs

| Finding                                                                                                                                   | Result                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Changes made only with duration/distance steppers, unit buttons or lap buttons were lost on reload.                                       | Button changes now save drafts, including clicks on their icons. Successful submission still clears the draft.                                                                                                                    |
| A restored draft could reopen in the profile's preferred distance unit instead of the chosen entry unit.                                  | Unsaved entries retain their units; elevation still uses the profile's metres/feet preference.                                                                                                                                    |
| Focusing a numeric figure placed the caret at its end, so forward Delete failed to clear it and paste could append.                       | Focus selects the figure, with the existing mobile replacement fallback retained. Clearing, typing and editing saves were checked.                                                                                                |
| Outdoor runs exposed a treadmill incline field.                                                                                           | Incline appears for treadmill runs, retains its value during toggles and is excluded from outdoor submissions.                                                                                                                    |
| Invalid lap heart-rate text displayed a warning but could save as missing data.                                                           | Unreadable distances and non-integer heart rates block submission. Drafts preserve the raw text for correction.                                                                                                                   |
| A pool swim's derived-distance error could lack a visible field error; an invalid pool length could become hidden after changing methods. | The error appears beside Lengths, and an invalid retained pool length becomes editable.                                                                                                                                           |
| Swimming pace previews could display invalid results or mishandle decimal commas in seconds.                                              | Pace appears only for valid positive swimming time within elapsed time, with comma decimals supported.                                                                                                                            |
| Decimal-capable optional measurements opened numeric-only mobile keyboards.                                                               | Elevation, cadence and power request decimal keyboards.                                                                                                                                                                           |
| Large text made stepper buttons crowd the figures; paired optional fields broke labels into awkward fragments.                            | Touch targets remain at least 44 CSS pixels, controls fit narrow panels, and paired fields stack when needed.                                                                                                                     |
| Substituting a rep exercise with a hold or carry retained reps/RIR and the old movement's targets.                                        | The replacement uses its own seconds/metres, ranges, rest and RPE convention. Programme identity and set count remain; the programme is not rewritten. Older sets recorded in the previous measure keep that measure on readback. |

## Coverage

| Flow                     | Fields and behavior exercised                                                                                                                                                                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Running                  | Outdoor/treadmill, all run-kind options, distance and units, duration, pace, all effort choices, date/time, surface, elevation, negative treadmill incline, fractional cadence, average/maximum heart rate, title and notes; save, edit, clear and history readback.                                           |
| Intervals                | Rep/recovery additions and removal, warm-up/cool-down in planned laps, planned layout versus explicit target copying, reload, raw invalid entries, heart-rate ordering, derived totals, watch-total mismatch, correction and saved lap readback. A timed plan requires actual distance instead of assuming it. |
| Cycling                  | Outdoor/indoor and assistance choices, miles/kilometres, duration/speed, optional distance versus explicit zero, fractional power/cadence, feet/metres elevation, effort, heart rates, title/notes, save and edit.                                                                                             |
| Swimming                 | Pool/open water, unknown/manual/counted-length distance, metres/yards, pool length/count, elapsed versus active time, comma seconds, pace preview, all stroke choices, stroke count, effort, heart rates, title/notes, oversized totals, correction and edit.                                                  |
| Strength                 | Optional check-in fields and clearing selected answers; exercise search, selected state, review count and machine selection; rep, timed and distance sets; load, RIR/RPE, working/backoff types, edit and completion; supersets and their minimum selection; body weight, notes and finished-session readback. |
| Substitution             | Remember checked/unchecked produces the corresponding database outcome; choosing the original planned exercise hides Remember. Planned holds and carries use their own measurement after replacement. Warm-up completion was also checked.                                                                     |
| Dates                    | Endurance entry chooser, backdated training date, required start time and database date; retrospective strength start and finish, required finish time, refusal of a finish before the start and correct 45-minute duration.                                                                                   |
| Persistence and recovery | UI submission → server action → PostgreSQL → saved view; corrected values, optional-field clearing, draft reloads, large-entry confirmation checked/unchecked and prevention of duplicate activity records. Offline check-in and set-save retry also pass.                                                     |
| Presentation             | Three endurance forms × light/dark × 390px, 320px, 320px at 200% text and 1440px; screenshots, horizontal overflow, figure fit and axe WCAG 2 A/AA + 2.1 AA checks on the main content. Screenshots were also visually reviewed.                                                                               |

## Verification

- Production build and TypeScript check passed.
- Changed-file ESLint, Prettier and `git diff --check` passed.
- Related Vitest groups passed: 232 tests/30 files after the shared numeric-input fix;
  108 tests/15 files after the final endurance layout change; 779 tests/81 files after
  the session-substitution repair. These groups overlap and are not additive.
- Existing logging walks passed all 33 checks, combining the endurance run with the
  targeted workout follow-up. The workout follow-up includes offline recovery.
- Regression tests cover draft buttons/units, numeric clearing, treadmill visibility,
  swim validation/preview, invalid lap text and substitution measurements/history.
- The full test suite was not run; checks followed the repository's changed-code policy.

## Environment and evidence

Used an isolated local PostgreSQL database, six months of seeded training history and
the local authentication simulator. Development ran on port 3103 and the production
build on 3104. Hosted data and services were not used.

The reusable [field audit](../../scripts/dev/audit-exercise-fields.mjs) accepts
`AUDIT_BASE_URL`, `AUDIT_DATABASE_URL`, `AUDIT_OUTPUT_DIR`, `AUDIT_BROWSER`,
`AUDIT_CASE` and `AUDIT_RUN`. Start with the fixtures from `scripts/dev/audit.mjs setup`.
`AUDIT_CASE` selects follow-ups without repeating passed cases; `AUDIT_RESUME_SESSION`
can continue the finish step of the retrospective case after its sets were verified.
The [existing logging audit](../../scripts/dev/audit-logging.mjs) now also accepts
`AUDIT_WALK` and waits for visible workout controls instead of an idle prefetch stream.

Local evidence is in `output/audit-logging-2026-10-22/`, with command logs in `output/logging-*.log`.
The consolidated browser record is `verified-browser-summary.json`. The final substitution
check completed its set/checkbox assertions in `results-substitution-final.json`, then
continued the finish validation in `results-substitution-finish.json`. Supplementary
Chromium/database evidence is in `strength-manual.json` and the strength screenshots.

Initial failures caused by stale audit selectors and navigation assumptions were corrected
in the harness. WebKit's cancelled prefetches during viewport changes stopped affecting
the audit when contexts started at the target viewport. Its host implementation renders
`datetime-local` as text, so the retrospective check also verifies server-side time ordering.
An older general workout harness still expects a removed onboarding link; the current
logging flows were verified by the new harness instead.

This validates the application with Chromium and WebKit device emulation. Physical-device
keyboards, operating-system date pickers, real authentication delivery and production-network
behavior were not exercised. Native date fields can scroll within their input at enlarged
text sizes; the page and controls remain within the viewport.
