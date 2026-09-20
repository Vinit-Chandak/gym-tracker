ALTER TABLE "program_drafts" ADD COLUMN "headline" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "program_drafts" ADD COLUMN "gate_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL;