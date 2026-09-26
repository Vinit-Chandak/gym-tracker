-- 0035 was appended with a timestamp below 0034. Drizzle skips it on databases
-- already at 0034, even though fresh databases execute it. Keep shipped migrations
-- immutable and repair forward with a timestamp above the existing high-water mark.
-- Existing budgets (including operator-approved retries) must remain untouched.
ALTER TABLE "coach_jobs" ADD COLUMN IF NOT EXISTS "attempt_budget" integer DEFAULT 3 NOT NULL;
