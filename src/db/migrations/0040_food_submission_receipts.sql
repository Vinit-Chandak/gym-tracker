CREATE TABLE IF NOT EXISTS "food_submission_receipts" (
  "user_id" uuid NOT NULL CONSTRAINT "food_submission_receipts_user_id_profiles_id_fk" REFERENCES "public"."profiles" ("id") ON DELETE CASCADE,
  "submission_key" uuid NOT NULL,
  "payload_digest" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "food_submission_receipts_user_id_submission_key_pk" PRIMARY KEY ("user_id", "submission_key")
);--> statement-breakpoint
ALTER TABLE "food_submission_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "food_submission_receipts_select" ON "food_submission_receipts";--> statement-breakpoint
CREATE POLICY "food_submission_receipts_select" ON "food_submission_receipts" FOR SELECT TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
DROP POLICY IF EXISTS "food_submission_receipts_insert" ON "food_submission_receipts";--> statement-breakpoint
CREATE POLICY "food_submission_receipts_insert" ON "food_submission_receipts" FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()) AND public.server_write());--> statement-breakpoint
DROP POLICY IF EXISTS "food_submission_receipts_update" ON "food_submission_receipts";--> statement-breakpoint
CREATE POLICY "food_submission_receipts_update" ON "food_submission_receipts" FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid()) AND public.server_write()) WITH CHECK (user_id = (select auth.uid()) AND public.server_write());--> statement-breakpoint
DROP POLICY IF EXISTS "food_submission_receipts_delete" ON "food_submission_receipts";--> statement-breakpoint
CREATE POLICY "food_submission_receipts_delete" ON "food_submission_receipts" FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()) AND public.server_write());
