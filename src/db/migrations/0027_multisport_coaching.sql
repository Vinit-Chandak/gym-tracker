DROP INDEX "session_plans_active_slot_uq";--> statement-breakpoint
ALTER TABLE "session_plans" ALTER COLUMN "program_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "session_plans" ALTER COLUMN "program_day_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "session_plans" ALTER COLUMN "cycle_index" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "session_plans" ALTER COLUMN "day_index" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "session_plans" ALTER COLUMN "gym_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "session_plans" ADD COLUMN "sport" "activity_sport" DEFAULT 'strength' NOT NULL;--> statement-breakpoint
ALTER TABLE "session_plans" ADD COLUMN "plan_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "session_plans" ADD COLUMN "occurrence_id" uuid;--> statement-breakpoint
ALTER TABLE "session_plans" ADD COLUMN "occurrence_revision_id" uuid;--> statement-breakpoint
ALTER TABLE "session_plans" ADD COLUMN "endurance" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "session_plans" ADD CONSTRAINT "session_plans_occurrence_fk" FOREIGN KEY ("user_id","occurrence_id","sport") REFERENCES "public"."planned_occurrences"("user_id","id","sport") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plans" ADD CONSTRAINT "session_plans_occurrence_revision_fk" FOREIGN KEY ("user_id","occurrence_id","occurrence_revision_id","sport") REFERENCES "public"."occurrence_versions"("user_id","occurrence_id","id","sport") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_plans_active_occurrence_uq" ON "session_plans" USING btree ("user_id","occurrence_id","occurrence_revision_id") WHERE status = 'active' and occurrence_id is not null;--> statement-breakpoint
CREATE INDEX "session_plans_occurrence_idx" ON "session_plans" USING btree ("user_id","occurrence_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_plans_active_slot_uq" ON "session_plans" USING btree ("program_id","cycle_index","day_index") WHERE status = 'active' and occurrence_id is null;--> statement-breakpoint
ALTER TABLE "session_plans" ADD CONSTRAINT "session_plans_target_chk" CHECK ((occurrence_id is null and program_id is not null and program_day_id is not null
            and cycle_index is not null and day_index is not null and gym_id is not null
            and sport = 'strength')
          or (occurrence_id is not null and occurrence_revision_id is not null
            and sport <> 'strength'));