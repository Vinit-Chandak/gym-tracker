ALTER TABLE "coach_notes" ADD COLUMN "sport" "activity_sport";--> statement-breakpoint
ALTER TABLE "coach_program_requests" ADD COLUMN "sport" "activity_sport" DEFAULT 'strength' NOT NULL;