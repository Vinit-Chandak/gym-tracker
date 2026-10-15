import type { TemplateOption } from "@/components/program-template-picker";
import type { ProgramTemplate } from "@/db/seed/data/templates";
import type { ActivitySport } from "@/domain/activity";
import type { ProgramBlueprint } from "@/domain/program-blueprint";
import { holdHyphens } from "@/lib/facts";

/** The sports a programme asks for: lifting where a day lifts, running where a day runs. */
export function blueprintSports(blueprint: ProgramBlueprint): ActivitySport[] {
  return [
    ...(blueprint.days.some((day) => day.includesLifting) ? (["strength"] as const) : []),
    ...(blueprint.days.some((day) => day.includesRun) ? (["running"] as const) : []),
  ];
}

const SPORT_WORDS: Record<ActivitySport, string> = {
  strength: "lifting",
  running: "running",
  cycling: "cycling",
  swimming: "swimming",
};

/**
 * The templates offered for the next block, and what the list is called.
 *
 * Those asking only for sports the athlete has on come first; one asking for a sport turned off
 * stays on offer (a programme keeps what it asks for, SPORT-01) but says so, rather than handing
 * "two easy runs" to a lifter with running off as the suggestion (year audit, October 2026). A
 * single template is not "suggested": it is the only one there is.
 */
export function templateOffer(
  templates: readonly ProgramTemplate[],
  enabled: readonly ActivitySport[],
): { heading: string; options: TemplateOption[] } {
  const options = templates.map((template) => {
    const off = blueprintSports(template.blueprint).filter((sport) => !enabled.includes(sport));
    const words = off.map((sport) => SPORT_WORDS[sport]);
    const option: TemplateOption = {
      slug: template.slug,
      name: template.name,
      summary: template.summary,
      highlights: template.highlights,
      weeks: template.blueprint.weeks,
      ...(off.length > 0 && {
        note: `Includes ${words.join(" and ")}, which ${off.length === 1 ? "is" : "are"} off in your sports.`,
      }),
    };
    return { option, fits: off.length === 0 };
  });
  // A stable sort: the catalogue's own order within each.
  const ranked = [...options.filter((o) => o.fits), ...options.filter((o) => !o.fits)];
  return {
    heading:
      ranked.length > 1 && ranked[0]!.fits
        ? "Or use a suggested template"
        : "Or start from a template",
    options: ranked.map((o) => o.option),
  };
}

/**
 * What starting the next block closes of the programme now (ADR 0054): its sessions still owed
 * or skipped can then only be logged on their own. Said under the button that starts it, since
 * nothing asks again before it does. A finished programme with nothing skipped closes nothing.
 */
export function closedByNextBlock(
  current: { name: string; complete: boolean; skipped: number } | null,
): string | null {
  if (!current || (current.complete && current.skipped === 0)) return null;
  return `Sessions of ${holdHyphens(current.name)} still owed or skipped can then only be logged on their own.`;
}
