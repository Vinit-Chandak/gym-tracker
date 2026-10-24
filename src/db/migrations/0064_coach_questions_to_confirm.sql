-- What the coach asks the athlete to confirm, kept apart from its doubts (ADR 0063).
--
-- A first programme came with seven lines under "What the coach is unsure about", two of them
-- questions only the athlete could answer ("Say if that does not fit") and five of them notes,
-- and nowhere to answer either. A draft now keeps the coach's questions in their own list, which
-- the review shows first and sends back to the coach with Ask for changes. Every existing draft
-- reads an empty list, exactly as before it had none.
--
-- Written by hand from what Drizzle generated, and safe to run twice like 0042 to 0063.
ALTER TABLE "program_drafts" ADD COLUMN IF NOT EXISTS "to_confirm" jsonb DEFAULT '[]'::jsonb NOT NULL;
