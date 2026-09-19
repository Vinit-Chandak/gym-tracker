ALTER TYPE "public"."training_sport" ADD VALUE 'cycle';--> statement-breakpoint
ALTER TYPE "public"."training_sport" ADD VALUE 'swim';--> statement-breakpoint
ALTER TABLE "shared_session_stats" ADD COLUMN "activity_id" uuid;