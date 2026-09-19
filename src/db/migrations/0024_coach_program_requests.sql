CREATE TABLE "coach_attempt_diagnostics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid,
	"attempt_id" uuid,
	"kind" text NOT NULL,
	"outcome" text NOT NULL,
	"reference_version" text NOT NULL,
	"contract_version" integer NOT NULL,
	"diagnostics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_attempt_diagnostics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "coach_program_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"source_id" text NOT NULL,
	"quote" text NOT NULL,
	"summary" text NOT NULL,
	"state" text DEFAULT 'waiting' NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"condition" text DEFAULT '' NOT NULL,
	"reconsider_after" date,
	"opened_job_id" uuid,
	"decided_job_id" uuid,
	"draft_id" uuid,
	"change_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"claimed_job_id" uuid,
	"claimed_attempt_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_program_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "coach_request_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"job_id" uuid,
	"state" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"change_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_request_decisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "coach_notes" ADD COLUMN "request_id" uuid;--> statement-breakpoint
ALTER TABLE "coach_attempt_diagnostics" ADD CONSTRAINT "coach_attempt_diagnostics_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_attempt_diagnostics" ADD CONSTRAINT "coach_attempt_diagnostics_job_id_coach_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."coach_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_program_requests" ADD CONSTRAINT "coach_program_requests_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_program_requests" ADD CONSTRAINT "coach_program_requests_opened_job_id_coach_jobs_id_fk" FOREIGN KEY ("opened_job_id") REFERENCES "public"."coach_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_program_requests" ADD CONSTRAINT "coach_program_requests_decided_job_id_coach_jobs_id_fk" FOREIGN KEY ("decided_job_id") REFERENCES "public"."coach_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_program_requests" ADD CONSTRAINT "coach_program_requests_draft_id_program_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."program_drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_program_requests" ADD CONSTRAINT "coach_program_requests_claimed_job_id_coach_jobs_id_fk" FOREIGN KEY ("claimed_job_id") REFERENCES "public"."coach_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_request_decisions" ADD CONSTRAINT "coach_request_decisions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_request_decisions" ADD CONSTRAINT "coach_request_decisions_request_id_coach_program_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."coach_program_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_request_decisions" ADD CONSTRAINT "coach_request_decisions_job_id_coach_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."coach_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_attempt_diagnostics_expiry_idx" ON "coach_attempt_diagnostics" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "coach_attempt_diagnostics_user_idx" ON "coach_attempt_diagnostics" USING btree ("user_id","completed_at");--> statement-breakpoint
CREATE INDEX "coach_program_requests_user_state_idx" ON "coach_program_requests" USING btree ("user_id","state","created_at");--> statement-breakpoint
CREATE INDEX "coach_program_requests_source_idx" ON "coach_program_requests" USING btree ("user_id","source_id");--> statement-breakpoint
CREATE INDEX "coach_request_decisions_request_idx" ON "coach_request_decisions" USING btree ("user_id","request_id","decided_at");--> statement-breakpoint
ALTER TABLE "coach_notes" ADD CONSTRAINT "coach_notes_request_id_coach_program_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."coach_program_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "coach_attempt_diagnostics_owner" ON "coach_attempt_diagnostics" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "coach_program_requests_owner" ON "coach_program_requests" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "coach_request_decisions_owner" ON "coach_request_decisions" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
-- A note queued for a programme review was a request that had not been answered yet. The old
-- receipt could only say it was waiting; carrying it forward as an open request keeps it
-- waiting for something rather than closing it. Notes marked remembered or no_action stay as
-- they are: a read receipt is not evidence that an ask was granted, and inventing a request
-- from every remembered note would bury the real ones. Re-running this adds nothing.
INSERT INTO "coach_program_requests"
  ("id", "user_id", "source_id", "quote", "summary", "state", "created_at", "updated_at")
SELECT
  gen_random_uuid(),
  n."user_id",
  'note:' || n."id",
  left(n."text", 500),
  left(coalesce(nullif(n."disposition_detail", ''), n."text"), 200),
  'waiting',
  n."created_at",
  now()
FROM "coach_notes" n
WHERE n."disposition" = 'queued_for_review'
  AND n."text" <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "coach_program_requests" r
    WHERE r."user_id" = n."user_id" AND r."source_id" = 'note:' || n."id"
  );--> statement-breakpoint
INSERT INTO "coach_program_requests"
  ("id", "user_id", "source_id", "quote", "summary", "state", "created_at", "updated_at")
SELECT
  gen_random_uuid(),
  v."user_id",
  v."source_id",
  left(coalesce(ws."notes", we."notes"), 500),
  left(coalesce(nullif(v."detail", ''), ws."notes", we."notes"), 200),
  'waiting',
  v."reviewed_at",
  now()
FROM "coach_note_reviews" v
-- The cast has to be safe on its own. A guard beside it in the same ON clause is not enough:
-- Postgres does not promise to evaluate the two in order, so a `workout:` row reached the
-- exercise join's `substring(... from 10)` and offered it a uuid with its first character cut
-- off. Matching the prefix inside the pattern makes the operand NULL for every row this join
-- is not about, whichever order the planner picks.
LEFT JOIN "workout_sessions" ws
  ON ws."user_id" = v."user_id"
  AND ws."id" = substring(
    v."source_id"
    from '^workout:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$'
  )::uuid
LEFT JOIN "workout_exercises" we
  ON we."user_id" = v."user_id"
  AND we."id" = substring(
    v."source_id"
    from '^exercise:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$'
  )::uuid
WHERE v."disposition" = 'queued_for_review'
  AND coalesce(ws."notes", we."notes", '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "coach_program_requests" r
    WHERE r."user_id" = v."user_id" AND r."source_id" = v."source_id"
  );
