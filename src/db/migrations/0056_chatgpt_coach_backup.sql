-- Additive: existing jobs and their attempt receipts keep their identities.
ALTER TABLE "coach_jobs" ADD COLUMN "worker_provider" text DEFAULT 'claude' NOT NULL;
--> statement-breakpoint
ALTER TABLE "coach_jobs" ADD COLUMN "primary_progress_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "coach_jobs" ADD COLUMN "primary_failed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "coach_jobs" ADD COLUMN "backup_taken_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "coach_jobs" SET "primary_progress_at" = "updated_at" WHERE "status" = 'claimed';
--> statement-breakpoint
UPDATE "coach_jobs" SET "primary_failed_at" = coalesce("completed_at", "updated_at") WHERE "status" = 'failed';
--> statement-breakpoint
ALTER TABLE "coach_jobs" ADD CONSTRAINT "coach_jobs_provider_chk" CHECK (worker_provider in ('claude','chatgpt'));
--> statement-breakpoint
CREATE TABLE "coach_primary_batches" (
  "batch_date" date PRIMARY KEY NOT NULL,
  "progress_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone,
  "completed_by" text CONSTRAINT "coach_primary_batches_provider_chk" CHECK (completed_by in ('claude','chatgpt'))
);
--> statement-breakpoint
-- Liveness is readable inside an athlete transaction; only the service connection writes it.
ALTER TABLE "coach_primary_batches" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "coach_primary_batches_read" ON "coach_primary_batches" FOR SELECT TO "authenticated" USING (true);
--> statement-breakpoint
-- Provider assignment, attempts and progress belong to the server, not browser REST writes.
DROP POLICY "coach_jobs_owner" ON "coach_jobs";
--> statement-breakpoint
CREATE POLICY "coach_jobs_select" ON "coach_jobs" FOR SELECT TO "authenticated" USING (user_id = (select auth.uid()));
--> statement-breakpoint
CREATE POLICY "coach_jobs_insert" ON "coach_jobs" FOR INSERT TO "authenticated" WITH CHECK (user_id = (select auth.uid()) and public.server_write());
--> statement-breakpoint
CREATE POLICY "coach_jobs_update" ON "coach_jobs" FOR UPDATE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write()) WITH CHECK (user_id = (select auth.uid()) and public.server_write());
--> statement-breakpoint
CREATE POLICY "coach_jobs_delete" ON "coach_jobs" FOR DELETE TO "authenticated" USING (user_id = (select auth.uid()) and public.server_write());
