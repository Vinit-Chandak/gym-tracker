-- How the top weight was worked: the working sets at that load and the most reps one of them
-- reached, so a board reads "7.5 kg · 4 × 12" rather than a bare load. Rows from before are
-- null until the shared-stats backfill re-derives them; the deploy runs it again under a new
-- name (SHARED_STATS_BACKFILL in src/db/backfill-shared-stats.ts).
ALTER TABLE "shared_exercise_stats" ADD COLUMN "top_weight_sets" integer;--> statement-breakpoint
ALTER TABLE "shared_exercise_stats" ADD COLUMN "top_weight_reps" integer;