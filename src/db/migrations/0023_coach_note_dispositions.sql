CREATE TABLE "coach_note_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_id" text NOT NULL,
	"disposition" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_note_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "coach_notes" ADD COLUMN "disposition" text;--> statement-breakpoint
ALTER TABLE "coach_notes" ADD COLUMN "disposition_detail" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_preferences" ADD COLUMN "review_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "coach_note_reviews" ADD CONSTRAINT "coach_note_reviews_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coach_note_reviews_user_source_uq" ON "coach_note_reviews" USING btree ("user_id","source_id");--> statement-breakpoint
CREATE POLICY "coach_note_reviews_owner" ON "coach_note_reviews" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));