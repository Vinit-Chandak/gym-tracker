CREATE TYPE "public"."coach_request_initiator" AS ENUM('athlete', 'coach');--> statement-breakpoint
ALTER TABLE "coach_requests" ADD COLUMN "initiated_by" "coach_request_initiator" DEFAULT 'coach' NOT NULL;--> statement-breakpoint
-- Rows written before this column existed: a re-plan row was what the athlete asked for, and a
-- nightly row was the coach's own. The two kinds of re-plan row cannot be told apart in history,
-- and the allowance only ever looks at today, so this keeps every past day counted as it was.
UPDATE "coach_requests" SET "initiated_by" = 'athlete' WHERE "trigger" = 'replan';
