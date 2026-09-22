# Today page migration incident — 22 September 2026

Production error reference `3280752969` was caused by PostgreSQL error `42703`:
`coach_jobs.attempt_budget` did not exist. Today loads coach workflow state, whose
job reconciliation query selects that column. The deployment itself had succeeded.

## Cause and audit gap

Migration `0035_coach_job_attempt_budget` was appended with timestamp
`1790051828680`, below migration 0034's `1790139392565` (and below 0033).
Drizzle determines pending migrations by comparing journal timestamps with the
database's highest recorded timestamp. Production was already at 0034, so it
silently skipped 0035.

Fresh databases apply both migrations on their initial run. The earlier local
audit and test suite used fresh databases and therefore missed the upgrade path.
The runtime log matched the user's exact error reference, and a read-only schema
inspection confirmed the missing column and the existing migration watermark.

## Repair and prevention

- Leave shipped migration history unchanged. Add idempotent forward migration
  `0036_repair_coach_attempt_budget` with a timestamp above every shipped entry.
- Add the missing integer column with default 3 and NOT NULL. Preserve existing
  budgets when the column already exists, including budgets raised by an operator.
- Reject new backdated migration entries before applying any migrations. Only the
  exact known 0035 ordering defect is exempt because 0036 repairs it.
- After migrating, check every application table column against the database.
  Refuse a production build if its schema is incomplete.
- Reproduce the existing-database upgrade in a regression test, including retained
  failure state, attempts, timestamps, and idempotent reapplication.

## Production restoration

Applied only 0036 through the normal migration runner after verifying it was the
only pending migration and `attempt_budget` was the only missing application
column. The repair used a 10-second lock timeout and 30-second statement timeout.

The post-migration schema check passed. The column is an integer, defaults to 3,
and is NOT NULL. A before/after checksum of all existing coach job fields and row
counts matched; the repair did not requeue jobs or alter their state.

## Validation

- All 47 focused migration, retry, and coach workflow tests passed.
- Type checking and ESLint for the changed TypeScript files passed.
- The full suite and production deployment verification are recorded in the PR.
