ALTER TABLE "profiles" ALTER COLUMN "time_zone" SET DEFAULT 'UTC';--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
-- Accounts that already trained here have nothing to be onboarded about.
UPDATE "profiles" p SET "onboarded_at" = p."created_at"
WHERE p."onboarded_at" IS NULL AND EXISTS (SELECT 1 FROM "gyms" g WHERE g."user_id" = p."id");
