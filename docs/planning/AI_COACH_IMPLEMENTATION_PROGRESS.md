# AI coach implementation progress

Updated September 12, 2026 on `codex/complete-coaching-flow`. The September 11 slices below are historical; the completion and live rollout status is recorded at the end.

## First slice: existing transport and evidence

The first change addressed independent Phase 1 defects while the Phase 0 weekly-change authority contract awaited clarification. It did not complete Phase 0 or Phase 1.

- Preserve the complete `run` payload through the authenticated service and into `session_plans`, for run-only and mixed sessions. Lifting-only transport remains covered.
- Reject a non-null `run.programRunId` from a different cycle or weekday, even when it belongs to the active program. An invalid submission must leave the existing plan intact.
- Compute lifting and running workload over the full requested interval in SQL, independently of the forty-record narrative samples. Retain the existing four calendar-week context shape.
- Add a shared aggregate reader, verified for four and eight calendar-week buckets. These include the partial current week; the future weekly-review task still needs its separate seven-day period and complete-week trend contract.
- Use completed workouts for comparable history and the coach's recent workout narrative. Raw history continues to expose unfinished sessions with their completion timestamps.
- Exclude warm-ups and unfinished workouts from lifting volume; derive muscle coverage from the actual performed exercise. Preserve the existing primary/secondary weighting calculation.
- Expose exact aggregate boundaries, partial-week status, incomplete-workout counts, narrative truncation flags, and completion timestamps for plan outcomes.
- Update the shared routine instructions and API documentation for these evidence semantics. Correct the documented chart-week boundary to Monday–Sunday.

This slice adds no migration, generation flow, dispatcher, or provider call. Live routine configuration and production records have not been changed.

## Verification

Before edits, the four targeted existing suites passed: 63 tests. New database-backed regression checks then reproduced the missing run payload, clipped lifting and running totals, and unfinished comparable history.

The regression suite uses synthetic athletes, lifting/run/mixed days, an independent programless athlete, more than forty recent records, work 21 days ago and seven weeks ago, and different calendar time zones. It exercises the actual authenticated service handler, real migrations, persistence, and row-level security.

Final verification:

- `npm test`: 335 tests passed in 50 files, including 11 new foundation regression tests.
- `npm run typecheck`: passed, including Next.js route type generation.
- Prettier on the changed files: passed.
- `npm run check`: stopped at repository-wide formatting warnings in pre-existing files, including the pre-existing untracked `output/` directory. Those unrelated files were not reformatted. Type-checking and the full test suite were then run separately.
- `npm run lint`: passed.

The existing machine/portable-history test fixtures now explicitly mark their past workouts complete, matching the completed-history contract. No production database, routine execution, or model evaluation was used.

## Second slice: prescription authority and durable timeouts

The user confirmed full weekly prescription autonomy, including set counts and exercise substitutions, while trying to preserve the planned muscles. This is recorded as D5 in the implementation plan.

- Added a versioned domain assessment of actual blueprint changes. Set/target/rest changes and substitutions can be automatic; changed split/day identity, scheduling, block length, program identity, or slot movement between days requires review.
- Compare recorded primary-muscle coverage per day, including set counts and unknown exercise metadata. Muscle matching is advisory; a gap does not independently force review. Existing split and schedule approval requirements remain in place.
- This classifier is the authority contract for the future weekly workflow. It does not activate automatic program writes in the legacy routine; durable jobs and activation gates remain necessary.
- Persist expired requests as failed before Today and AI-coach settings assemble status. Repeated reconciliation preserves terminal outcomes and does not dispatch work.
- Check request ownership, gym, trigger, pending status, and expiry before accepting an associated plan. Lock the request through the acceptance transaction so failure/timeout callbacks cannot overwrite a successful terminal result.
- Full program-version/occurrence/source-revision freshness and newest-intent acceptance still require the durable-task phase. These request checks do not claim to replace it.

Verification:

- `npm test`: 359 tests passed in 52 files, including 14 change-authority tests and 10 database-backed request-lifecycle tests.
- `npm run typecheck` and `npm run lint`: passed.
- Prettier on the changed implementation, tests, settings page, and automation guide: passed. Planning documents retain the repository's existing formatting exemption.
- The request tests cover the exact timeout boundary, durable same-read status, row-level isolation, invalid associations, duplicate results, and late failure callbacks through the actual authenticated service.

No migration or live routine change is included in this slice. The repository-wide formatting issues reported above remain outside its scope.

## Follow-up audit and review-period contract

The user accepted either review-weekday transition option. D6 records the selected rule: use the first new weekday at least seven days after the previous scheduled review boundary. The domain contract returns the complete seven-day evidence interval at 04:00 Asia/Kolkata. It requires an existing scheduled boundary and does not yet initialize an athlete's first anchor, dispatch work, or persist review identity.

Re-read both implementation commits, their callers, schema constraints, tests, runtime instructions, and plan requirements. The audit found and corrected:

- Recent training and comparable histories could include records after the aggregate cutoff. All three training reads now use the same context timestamp, and comparable workouts must be complete by it. Raw workout history remains available. A synthetic fixture reproduces late completion and future records crowding the real run out of a bounded sample.
- The any-equipment starting-history helper spread an incoming query, accidentally retaining an extra machine filter. It now selects only its supported fields.
- Blueprint parsing allowed duplicate slot lineage and duplicate run occurrences. These ambiguous inputs now fail before change classification or parsed program writes.
- UUID letter casing could misclassify unchanged slot identity or reject the correct request gym. Lineage parsing and the request-gym comparison now use the database's canonical casing; mixed-case duplicates remain invalid.
- Reconciliation and pending-request selection used separate instants. A single status read now shares its cutoff, including the exact fifteen-minute boundary.

Verification:

- Added eight regression cases that failed before the corrections: future workout/run evidence, completion after the comparison cutoff, duplicate lineage in either blueprint, duplicate run occurrences, and equivalent UUID casing in lineage and request-gym comparisons. The starting-history filter issue was reproduced during those checks and corrected.
- Added 13 cadence tests, including a sweep of all 49 old/new weekday pairs, exact evidence intervals, year boundaries, and rejection of actual execution times as scheduled anchors. Extended the timeout-boundary test to cover clock movement between status queries.
- `npm test`: 380 tests passed in 53 files.
- `npm run typecheck` and `npm run lint`: passed.
- Prettier on all implementation files changed across both earlier commits and this audit: passed after correcting one formatting warning. Planning documents remain exempt under the repository configuration.

No live routine, migration, or provider execution is included. The classifier and cadence functions remain contracts for the future workflow, not live automatic activation. Request tests verify terminal transitions and isolation; the in-process database suite does not establish multi-connection race safety for the future job workflow.

## Personal coaching facts stored per athlete

The user identified the account and requested database storage without hardcoded account identifiers. The account selector was supplied only as runtime input, matched exactly one authentication record, and was not added to source, tests, seeds, migrations, or this document.

Stored the two confirmed restrictions/priority notes in that athlete's existing `coach_memos.user_notes` using the app's configured database connection. The write ran under the athlete's row-level security scope, locked the existing memo, and guarded against notes changing after inspection. One row changed. A separate read after commit verified the notes and that the coach-written overview and its timestamp were preserved.

Updated the shared coach instructions to use the current athlete's recorded restrictions and priorities instead of those two universal personal rules. Athlete-authored notes take precedence over the model-derived overview. The existing Settings page exposes those notes and the existing planning context includes them; no new schema or account-specific code is needed. Future structured intake/facts work must preserve this confirmed input.

Added a synthetic regression check for notes reaching planning context, surviving a model callback (including an attempted `userNotes` field), and resisting another athlete's reads/writes.

Verification: all 381 tests in 53 files passed, as did type checking, lint, changed-file Prettier, and the diff whitespace check. A tracked-file scan found no occurrence of the supplied account email. The live routine configuration has not been changed; shared instruction edits are on the implementation branch.

## September 12: complete application workflow and account fixes

Audited the two referenced tasks (`01a08f40-6c9c-7051-bcf3-7179863ad3aa` and `01a08f79-a22b-7803-907a-7bdebdde0a84`) and main's history. The planning and foundation slices had been merged through `c35892d`; the personalized screens, durable execution and manual flows had not been implemented. This branch starts from main at `8ce3130`.

The deletion code removed the public profile before attempting optional Auth deletion, then reported success even when the admin credential was unavailable. A read-only account lifecycle check found a retained confirmed Auth identity and a later recreated profile. Repeat signup could therefore encounter the existing identity, send no new signup confirmation, and still show the old success message. The profile fallback also omitted signup name metadata. Email autoconfirm was disabled in the inspected database; actual SMTP delivery and production admin-credential availability remain separate live checks.

Implemented:

- Auth-first account deletion with cascade, no profile-only fallback or false success, and tests for absent credentials, failures and delete/recreate isolation. Signup distinguishes the obfuscated existing-identity response; verified name metadata seeds/repairs only a blank profile name.
- Optional basic onboarding details, preserved signup name, and Select all/Clear all for machines. Removed the old routing guard that still required body measurements to reach the gym or programme steps.
- Personalized creation in onboarding and Settings: six saved steps, a long prompt, optional reported lifts and measurements, private retained reports with removal, confirmation, durable status, draft preview/edit/start, and the founder template as an explicit suggestion. Existing profile facts prefill new setup without inventing availability or ability.
- Three durable job kinds with idempotent requests, single live claims, leases, bounded retries, attempt receipts, exact source/target/gym checks and strict machine/measure/slot/run validation. Opening plans resolve draft-local positions during atomic activation.
- Daily keyset dispatch without a 500-athlete cap; weekly review before preparation, seven-day initial eligibility, persisted rest-day anchors, no-change reviews, automatic prescription revisions and reviewed structural changes. Open workouts, including ad hoc workouts, freeze acceptance and activation. Log/check-in/finish/page reads do not dispatch AI.
- One shared three-request allowance for creation and gym changes per athlete-local calendar day. Repeated clicks and unchanged gym intents do not spend another request. One-off gym intent does not change the default gym.
- Manual programmes with optional RIR, days/exercises/targets and run structure, duplicate/edit-future/archive actions, custom exercises, saved/repeated routines, and routine-to-programme-day import. Saved prescription snapshots preserve unknown targets and historical workouts.
- Additive migrations 0013–0015, private-file RLS/cascades, source revision triggers, one-active-programme constraint, new workflow CLI and rewritten repository routine skill. Independent intake/generation/dispatch/automatic-review controls accompany the master gate. Old service writes are blocked when the workflow is enabled.
- Task-specific compact policy, complete review/30-day/eight-week aggregates, bounded narrative evidence, retained decisions, status polling backoff, context-size/time and dispatcher-count diagnostics. Added a versioned synthetic model-quality evaluation set and the exact replacement saved routine prompt in the automation guide.

Verification:

- `npm test`: 480 tests passed in 78 files. New checks cover the actual authenticated service, ownership and freshness, first programme activation, shared quota/local midnight, 502 additional eligible accounts across dispatcher pages, report removal, retry receipts, optional-profile routing, manual history and rollout behavior.
- `npm run typecheck`, `npx eslint src scripts`, and `npm run build`: passed. Changed-file Prettier and the diff whitespace check passed. Repository-wide lint still includes pre-existing generated `.next-qa` files, so the lint result reported here is explicitly for application and script sources.
- Phone-size browser checks: programme choices, six-step intake, retained reports, draft review, manual targets/optional RIR, and selection of all 71 machines. No browser console errors observed. These are synthetic previews; model generation and real email were not simulated as live success.
- Read-only live preflight found zero accounts with multiple active programmes. No live database records or schema were changed. Real migrations and account cascades ran in the isolated PGlite test database.

## Remaining live release gates

The implementation is not a live deployment. Supabase and Claude dashboards were signed out in the available browser; the access request remains pending. No cloud routine configuration or production environment was changed.

- Review/merge the branch, apply migrations 0013–0015 before serving its pages, and deploy with the documented switches. The routine must clone a branch containing the new skill and CLI.
- Verify/configure the server-only Supabase admin credential; test real signup confirmation delivery, sign-in/name persistence, and disposable account deletion/re-registration. Never delete an existing account as a repair without its explicit selection.
- Update the saved cloud routine prompt, verify 04:00 Asia/Kolkata, environment authorization, API trigger, model and current owner allowance. Run claimed creation/weekly/gym flows against the deployed app before enabling automatic revisions.
- Run the synthetic model-quality cases and measure small/typical/large context bytes and tokens, real batch capacity, database query plans and Start/log latency against a baseline. The local tests and diagnostic hooks do not establish provider quality, production capacity or multi-connection PostgreSQL race behavior.

Rollout order, controls, recovery and the concrete replacement routine prompt are in [the automation guide](../coach-automation.md). Keep these gates open until their results are verified; passing local checks does not close them.
