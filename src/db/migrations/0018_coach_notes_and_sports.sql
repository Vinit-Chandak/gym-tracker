CREATE TABLE "coach_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "coach_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session_plans" ADD COLUMN "sport_summaries" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_notes" ADD CONSTRAINT "coach_notes_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_notes_user_created_idx" ON "coach_notes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE POLICY "coach_notes_owner" ON "coach_notes" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
-- Preserve existing notes for the first automatic review. Their original submission time is
-- unknown; use the memo's earliest timestamp, never the migration time as fresh symptom evidence.
INSERT INTO public.coach_notes (user_id, text, created_at)
SELECT user_id, user_notes, created_at FROM public.coach_memos WHERE length(trim(user_notes)) > 0;--> statement-breakpoint
CREATE TRIGGER coach_source_changed AFTER INSERT OR UPDATE OR DELETE ON public.coach_notes
FOR EACH ROW EXECUTE FUNCTION public.bump_coach_source_revision();
