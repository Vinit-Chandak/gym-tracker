"use client";
import { NavRow } from "@/components/ui/nav-row";

import { builderPath, coachQuestionsPath, type ProgrammeBase } from "./programme-paths";

/**
 * The two ways to get a programme (board Plan): rows, each its glyph, what it is, and a line on
 * what that means. On the first run the third way, not having one, is the foot's.
 */
export function ProgrammeOptions({
  onboarding = false,
}: {
  onboarding?: boolean;
  /** Kept for callers inside a box; the rows draw no box of their own. */
  nested?: boolean;
}) {
  const base: ProgrammeBase = onboarding ? "/welcome/programme" : "/plan";
  return (
    <ul>
      <NavRow
        href={coachQuestionsPath(base)}
        glyph="coach"
        label="Create with the coach"
        sub="Answer a few questions and the coach writes it."
      />
      <NavRow
        href={builderPath(base)}
        glyph="edit"
        label="Build it yourself"
        sub="Choose your own days, exercises and targets."
      />
    </ul>
  );
}
