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

## Unresolved decision

The user has been asked how a changed weekly review weekday should take effect: use the new weekday once seven days have elapsed from the previous scheduled review boundary, or keep the next review on the old day before switching with the same minimum interval. No answer has been supplied; that transition rule is not implemented.

## Remaining work

- Finish Phase 0 task envelopes, output schemas, review-period contracts, and acceptance invariants after clarifying the relevant decisions; integrate the tested authority assessment into the weekly workflow.
- Finish Phase 1 semantic machine/measure/slot validation, full stale-result rejection, and migration of personal constraints out of universal instructions.
- Implement the remaining phases in the implementation plan: durable tasks and drafts, onboarding, manual programs and routines, daily/weekly execution, and rollout controls.
- Verify the actual cloud schedule and allowance during rollout. Measure production-equivalent context size, capacity, and tracker latency before release; local correctness checks are not those measurements.
