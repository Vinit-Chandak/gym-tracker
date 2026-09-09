import type { ProgramBlueprint } from "../../../domain/program-blueprint";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "./program";

export type ProgramTemplate = {
  /** Stable id used in URLs and forms. Matches the blueprint slug. */
  slug: string;
  name: string;
  /** One line for the picker. */
  summary: string;
  /** Short bullets describing the shape of the week. */
  highlights: readonly string[];
  blueprint: ProgramBlueprint;
};

function describe(blueprint: ProgramBlueprint): { days: number; lifting: number; sets: number } {
  return {
    days: blueprint.days.length,
    lifting: blueprint.days.filter((d) => d.includesLifting).length,
    sets: blueprint.days.reduce(
      (total, day) => total + day.exercises.reduce((n, e) => n + e.sets, 0),
      0,
    ),
  };
}

const hybrid = describe(STRENGTH_AESTHETICS_HYBRID_8WK);

/**
 * Programmes any account can adopt. A template is read-only shared content: adopting one copies
 * it into the user's own rows, so their edits, versions and history stay theirs.
 *
 * Adding a template means adding a blueprint here. Nothing else in the app is template-aware,
 * which is also what lets a generated plan take the same path (see `program-blueprint.ts`).
 */
export const PROGRAM_TEMPLATES: readonly ProgramTemplate[] = [
  {
    slug: STRENGTH_AESTHETICS_HYBRID_8WK.slug,
    name: STRENGTH_AESTHETICS_HYBRID_8WK.name,
    summary: "Strength first, muscle second, with two easy runs and a mobility day.",
    highlights: [
      `${STRENGTH_AESTHETICS_HYBRID_8WK.weeks} weeks, ${hybrid.days}-day cycle (${hybrid.lifting} lifting days)`,
      `${hybrid.sets} working sets a cycle across upper and lower splits`,
      "Loads set by reps in reserve, so it fits any starting strength",
      "Two easy runs a week, with a stop rule if a niggle worsens",
    ],
    blueprint: STRENGTH_AESTHETICS_HYBRID_8WK,
  },
];

export function findProgramTemplate(slug: string): ProgramTemplate | undefined {
  return PROGRAM_TEMPLATES.find((template) => template.slug === slug);
}
