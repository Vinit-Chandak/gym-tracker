# AI coach implementation progress

Updated September 11, 2026 on `codex/ai-first-coaching`.

## First slice: existing transport and evidence

The first change addresses independent Phase 1 defects while the Phase 0 weekly-change authority contract awaits clarification. It does not complete Phase 0 or Phase 1.

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

## Unresolved decision

The implementation plan calls weekly automatic revisions “small” without defining their permitted scope or limits. The user has been asked whether automatic changes cover only load/reps/RIR/rest, also set counts, or also exercise substitutions. No answer has been supplied and no authority policy has been implemented.

## Remaining work

- Finish Phase 0 task envelopes, output schemas, authority classification, review-period contracts, and acceptance invariants after clarifying the relevant decisions.
- Finish Phase 1 semantic machine/measure/slot validation, stale-result rejection, durable timeout handling, and migration of personal constraints out of universal instructions.
- Implement the remaining phases in the implementation plan: durable tasks and drafts, onboarding, manual programs and routines, daily/weekly execution, and rollout controls.
- Verify the actual cloud schedule and allowance during rollout. Measure production-equivalent context size, capacity, and tracker latency before release; local correctness checks are not those measurements.
