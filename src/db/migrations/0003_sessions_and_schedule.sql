CREATE TYPE "public"."slot_event_status" AS ENUM('completed', 'skipped');--> statement-breakpoint
CREATE TABLE "program_slot_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"cycle_index" integer NOT NULL,
	"day_index" integer NOT NULL,
	"status" "slot_event_status" NOT NULL,
	"workout_session_id" uuid,
	"occurred_on" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_slot_events_indexes_chk" CHECK (cycle_index >= 1 and day_index >= 1)
);
--> statement-breakpoint
ALTER TABLE "program_slot_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "rest_timer_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "start_day_index" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD COLUMN "skipped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "cycle_index" integer;--> statement-breakpoint
ALTER TABLE "program_slot_events" ADD CONSTRAINT "program_slot_events_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_slot_events" ADD CONSTRAINT "program_slot_events_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "program_slot_events_slot_uq" ON "program_slot_events" USING btree ("program_id","cycle_index","day_index");--> statement-breakpoint
CREATE POLICY "program_slot_events_owner" ON "program_slot_events" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));