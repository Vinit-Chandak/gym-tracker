CREATE TABLE "coach_change_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"program_before" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_change_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "coach_evidence_baselines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"reference" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_evidence_baselines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "equipment_instances" ADD COLUMN "available_loads" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "equipment_instances" ADD COLUMN "load_convention" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_memos" ADD COLUMN "items" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_memos" ADD COLUMN "memory_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_change_records" ADD CONSTRAINT "coach_change_records_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_evidence_baselines" ADD CONSTRAINT "coach_evidence_baselines_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_change_records_user_created_idx" ON "coach_change_records" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "coach_evidence_baselines_scope_uq" ON "coach_evidence_baselines" USING btree ("user_id","scope");--> statement-breakpoint
CREATE POLICY "coach_change_records_owner" ON "coach_change_records" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "coach_evidence_baselines_owner" ON "coach_evidence_baselines" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));