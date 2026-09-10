CREATE TYPE "public"."coach_request_status" AS ENUM('requested', 'planned', 'failed');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('active', 'superseded', 'consumed', 'void');--> statement-breakpoint
CREATE TYPE "public"."plan_trigger" AS ENUM('nightly', 'replan');--> statement-breakpoint
CREATE TABLE "coach_memos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"overview" text DEFAULT '' NOT NULL,
	"user_notes" text DEFAULT '' NOT NULL,
	"overview_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_memos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "coach_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"gym_id" uuid,
	"status" "coach_request_status" DEFAULT 'requested' NOT NULL,
	"reason" text,
	"routine_session_id" text,
	"routine_session_url" text,
	"error" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "coach_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "session_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"program_day_id" uuid NOT NULL,
	"cycle_index" integer NOT NULL,
	"day_index" integer NOT NULL,
	"gym_id" uuid NOT NULL,
	"status" "plan_status" DEFAULT 'active' NOT NULL,
	"trigger" "plan_trigger" NOT NULL,
	"request_id" uuid,
	"summary" text NOT NULL,
	"warmup" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exercises" jsonb NOT NULL,
	"model" text,
	"routine_session_url" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone,
	"workout_session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_plans_indexes_chk" CHECK (cycle_index >= 1 and day_index >= 1)
);
--> statement-breakpoint
ALTER TABLE "session_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "ai_coach_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_memos" ADD CONSTRAINT "coach_memos_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_requests" ADD CONSTRAINT "coach_requests_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_requests" ADD CONSTRAINT "coach_requests_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plans" ADD CONSTRAINT "session_plans_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plans" ADD CONSTRAINT "session_plans_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plans" ADD CONSTRAINT "session_plans_program_day_id_program_days_id_fk" FOREIGN KEY ("program_day_id") REFERENCES "public"."program_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plans" ADD CONSTRAINT "session_plans_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plans" ADD CONSTRAINT "session_plans_request_id_coach_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."coach_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plans" ADD CONSTRAINT "session_plans_workout_session_id_workout_sessions_id_fk" FOREIGN KEY ("workout_session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coach_memos_user_uq" ON "coach_memos" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "coach_requests_user_requested_idx" ON "coach_requests" USING btree ("user_id","requested_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "session_plans_active_slot_uq" ON "session_plans" USING btree ("program_id","cycle_index","day_index") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "session_plans_user_generated_idx" ON "session_plans" USING btree ("user_id","generated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "session_plans_session_idx" ON "session_plans" USING btree ("workout_session_id");--> statement-breakpoint
CREATE POLICY "coach_memos_owner" ON "coach_memos" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "coach_requests_owner" ON "coach_requests" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "session_plans_owner" ON "session_plans" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));