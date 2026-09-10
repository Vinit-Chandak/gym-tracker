ALTER TABLE "program_exercises" ADD COLUMN "lineage_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_requests" ADD COLUMN "trigger" "plan_trigger" DEFAULT 'replan' NOT NULL;--> statement-breakpoint
ALTER TABLE "session_plans" ADD COLUMN "run" jsonb;--> statement-breakpoint
ALTER TABLE "session_plans" ADD COLUMN "warnings" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "program_exercises_lineage_idx" ON "program_exercises" USING btree ("lineage_id");