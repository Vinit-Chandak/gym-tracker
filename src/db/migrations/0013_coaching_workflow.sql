CREATE TABLE "coach_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coach_attachments_size_chk" CHECK ("coach_attachments"."size" > 0 and "coach_attachments"."size" <= 3145728)
);
--> statement-breakpoint
ALTER TABLE "coach_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "coach_gym_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"cycle_index" integer NOT NULL,
	"day_index" integer NOT NULL,
	"gym_id" uuid NOT NULL,
	"requested_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_gym_intents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "coach_intakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"answers" jsonb NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_intakes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "coach_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"trigger" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"intake_id" uuid,
	"target" jsonb NOT NULL,
	"source_revision" bigint,
	"attempt_id" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_until" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatch_started_at" timestamp with time zone,
	"routine_session_id" text,
	"routine_session_url" text,
	"result" jsonb,
	"result_digest" text,
	"error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coach_jobs_status_chk" CHECK ("coach_jobs"."status" in ('queued','claimed','succeeded','needs_input','failed','superseded')),
	CONSTRAINT "coach_jobs_kind_chk" CHECK ("coach_jobs"."kind" in ('create_program','prepare_session','review_program'))
);
--> statement-breakpoint
ALTER TABLE "coach_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "coach_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"mode" text DEFAULT 'track' NOT NULL,
	"intake_id" uuid,
	"review_weekday" integer,
	"review_anchor_at" timestamp with time zone,
	"consented_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coach_preferences_mode_chk" CHECK ("coach_preferences"."mode" in ('coach','manual','track')),
	CONSTRAINT "coach_preferences_weekday_chk" CHECK ("coach_preferences"."review_weekday" is null or "coach_preferences"."review_weekday" between 1 and 7)
);
--> statement-breakpoint
ALTER TABLE "coach_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "coach_source_revisions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"revision" bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_source_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "coach_weekly_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"outcome" text NOT NULL,
	"rationale" text NOT NULL,
	"draft_id" uuid,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_weekly_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "program_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'editing' NOT NULL,
	"blueprint" jsonb NOT NULL,
	"opening_plan" jsonb,
	"job_id" uuid,
	"intake_id" uuid,
	"base_program_id" uuid,
	"source_revision" bigint NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"rationale" text DEFAULT '' NOT NULL,
	"uncertainties" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"activated_program_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "program_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "saved_routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"day" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_routines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "coach_attachments" ADD CONSTRAINT "coach_attachments_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_gym_intents" ADD CONSTRAINT "coach_gym_intents_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_gym_intents" ADD CONSTRAINT "coach_gym_intents_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_intakes" ADD CONSTRAINT "coach_intakes_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_jobs" ADD CONSTRAINT "coach_jobs_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_jobs" ADD CONSTRAINT "coach_jobs_intake_id_coach_intakes_id_fk" FOREIGN KEY ("intake_id") REFERENCES "public"."coach_intakes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_preferences" ADD CONSTRAINT "coach_preferences_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_preferences" ADD CONSTRAINT "coach_preferences_intake_id_coach_intakes_id_fk" FOREIGN KEY ("intake_id") REFERENCES "public"."coach_intakes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_source_revisions" ADD CONSTRAINT "coach_source_revisions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_weekly_reviews" ADD CONSTRAINT "coach_weekly_reviews_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_weekly_reviews" ADD CONSTRAINT "coach_weekly_reviews_job_id_coach_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."coach_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_weekly_reviews" ADD CONSTRAINT "coach_weekly_reviews_draft_id_program_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."program_drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_drafts" ADD CONSTRAINT "program_drafts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_drafts" ADD CONSTRAINT "program_drafts_job_id_coach_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."coach_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_drafts" ADD CONSTRAINT "program_drafts_intake_id_coach_intakes_id_fk" FOREIGN KEY ("intake_id") REFERENCES "public"."coach_intakes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_drafts" ADD CONSTRAINT "program_drafts_base_program_id_programs_id_fk" FOREIGN KEY ("base_program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_drafts" ADD CONSTRAINT "program_drafts_activated_program_id_programs_id_fk" FOREIGN KEY ("activated_program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_routines" ADD CONSTRAINT "saved_routines_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_attachments_user_idx" ON "coach_attachments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coach_gym_intents_occurrence_uq" ON "coach_gym_intents" USING btree ("user_id","program_id","cycle_index","day_index");--> statement-breakpoint
CREATE UNIQUE INDEX "coach_intakes_user_revision_uq" ON "coach_intakes" USING btree ("user_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "coach_jobs_dedupe_uq" ON "coach_jobs" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "coach_jobs_claim_idx" ON "coach_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "coach_jobs_user_created_idx" ON "coach_jobs" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "coach_weekly_reviews_period_uq" ON "coach_weekly_reviews" USING btree ("user_id","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "program_drafts_job_uq" ON "program_drafts" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "program_drafts_user_idx" ON "program_drafts" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "saved_routines_user_idx" ON "saved_routines" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "programs_one_active_per_user_uq" ON "programs" USING btree ("user_id") WHERE status = 'active';--> statement-breakpoint
CREATE POLICY "coach_attachments_owner" ON "coach_attachments" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "coach_gym_intents_owner" ON "coach_gym_intents" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "coach_intakes_owner" ON "coach_intakes" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "coach_jobs_owner" ON "coach_jobs" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "coach_preferences_owner" ON "coach_preferences" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "coach_source_revisions_owner" ON "coach_source_revisions" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "coach_weekly_reviews_owner" ON "coach_weekly_reviews" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "program_drafts_owner" ON "program_drafts" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "saved_routines_owner" ON "saved_routines" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
-- Source revisions change in the same transaction as the athlete's training inputs.
-- Ignore workflow status, derived session plans, and shared catalogue writes.
INSERT INTO public.coach_source_revisions (user_id, revision)
SELECT id, 1 FROM public.profiles ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.bump_coach_source_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE athlete uuid; record_data jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN record_data := to_jsonb(OLD); ELSE record_data := to_jsonb(NEW); END IF;
  IF TG_TABLE_NAME = 'profiles' THEN athlete := (record_data->>'id')::uuid;
  ELSE athlete := (record_data->>'user_id')::uuid; END IF;
  IF athlete IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE id = athlete) THEN
    INSERT INTO public.coach_source_revisions (user_id, revision) VALUES (athlete, 1)
    ON CONFLICT (user_id) DO UPDATE SET revision = coach_source_revisions.revision + 1;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE source_table text;
BEGIN
  FOREACH source_table IN ARRAY ARRAY[
    'profiles', 'gyms', 'equipment_instances', 'gym_absent_equipment_types',
    'exercises', 'exercise_equipment_options', 'programs', 'program_days',
    'program_exercises', 'program_runs', 'program_exercise_fallbacks', 'program_slot_events',
    'workout_sessions', 'workout_exercises', 'set_logs', 'runs', 'daily_recovery',
    'body_weight_logs', 'coach_memos', 'coach_preferences', 'coach_attachments'
  ] LOOP
    EXECUTE format('CREATE TRIGGER coach_source_changed AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.bump_coach_source_revision()', source_table);
  END LOOP;
END;
$$;
