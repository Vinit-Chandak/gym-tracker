-- How a programme's cycle repeats (owner, 11 October 2026; ADR 0051): "weekly", one cycle a
-- week with each day on its weekday, or "rolling", the days back to back with as many cycles as
-- fill the programme's weeks. Null for every programme written before the choice existed; the
-- app reads those from their days, which keeps each one counting its cycles as it did.
--
-- Written by hand from what Drizzle generated, and safe to run twice: the column is added only if
-- missing and the check is replaced. The previous deployment neither reads nor writes it.
ALTER TABLE "programs" ADD COLUMN IF NOT EXISTS "repeats" text;--> statement-breakpoint
ALTER TABLE "programs" DROP CONSTRAINT IF EXISTS "programs_repeats_chk";--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_repeats_chk" CHECK (repeats is null or repeats in ('weekly', 'rolling'));
