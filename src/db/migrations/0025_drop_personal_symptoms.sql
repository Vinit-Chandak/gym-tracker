-- The lower-back and shin readings were one person's own rehab tracking, asked of everybody
-- who has used the app since. They are dropped here rather than left unread: a column nobody
-- can fill in and nobody can see is a question about the schema every later reader has to ask.
-- The runs' six readings go with them, and so does the recovery log's copy.
--
-- program_runs.shin_rule is renamed, not dropped. "When to stop this run" is good advice for
-- any runner; only its name was personal, and the coach's own guidance in that column is kept.
ALTER TABLE "program_runs" RENAME COLUMN "shin_rule" TO "stop_rule";--> statement-breakpoint
ALTER TABLE "workout_sessions" DROP CONSTRAINT "workout_sessions_scales_chk";--> statement-breakpoint
ALTER TABLE "daily_recovery" DROP CONSTRAINT "daily_recovery_scales_chk";--> statement-breakpoint
ALTER TABLE "workout_sessions" DROP COLUMN "back_pain_pre";--> statement-breakpoint
ALTER TABLE "workout_sessions" DROP COLUMN "shin_left_pre";--> statement-breakpoint
ALTER TABLE "workout_sessions" DROP COLUMN "shin_right_pre";--> statement-breakpoint
ALTER TABLE "daily_recovery" DROP COLUMN "back_pain";--> statement-breakpoint
ALTER TABLE "daily_recovery" DROP COLUMN "shin_left";--> statement-breakpoint
ALTER TABLE "daily_recovery" DROP COLUMN "shin_right";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "shin_left_pre";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "shin_right_pre";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "shin_left_during";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "shin_right_during";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "shin_left_post";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "shin_right_post";--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_scales_chk" CHECK ((sleep_quality is null or sleep_quality between 1 and 5)
        and (energy is null or energy between 1 and 5)
        and (fatigue is null or fatigue between 1 and 5)
        and (soreness is null or soreness between 1 and 5));--> statement-breakpoint
ALTER TABLE "daily_recovery" ADD CONSTRAINT "daily_recovery_scales_chk" CHECK ((sleep_quality is null or sleep_quality between 1 and 5)
        and (energy is null or energy between 1 and 5)
        and (fatigue is null or fatigue between 1 and 5)
        and (soreness is null or soreness between 1 and 5));
