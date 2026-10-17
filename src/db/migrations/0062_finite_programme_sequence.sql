-- A finite sequence keeps each day's prescription and finishes after one pass. Existing
-- weekly/rolling programmes and their historical versions retain their current behaviour.
ALTER TABLE "programs" DROP CONSTRAINT IF EXISTS "programs_repeats_chk";--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_repeats_chk" CHECK (repeats is null or repeats in ('weekly', 'rolling', 'once'));
