ALTER TABLE "set_logs" ADD COLUMN "effort_reported" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "effort_reported" boolean DEFAULT false NOT NULL;