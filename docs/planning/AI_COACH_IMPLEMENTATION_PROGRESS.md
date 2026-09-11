# AI coach implementation progress

Updated September 11, 2026 on `codex/ai-first-coaching`.

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

## Remaining work

- Finish Phase 0 task envelopes, output schemas, and acceptance invariants; integrate the tested authority and review-period contracts with initial anchors, durable review identity, and due/catch-up handling.
- Finish Phase 1 semantic machine/measure/slot validation and full stale-result rejection. Carry confirmed athlete notes into the future structured facts model without changing their meaning.
- Implement the remaining phases in the implementation plan: durable tasks and drafts, onboarding, manual programs and routines, daily/weekly execution, and rollout controls.
- Verify the actual cloud schedule and allowance during rollout. Measure production-equivalent context size, capacity, and tracker latency before release; local correctness checks are not those measurements.
