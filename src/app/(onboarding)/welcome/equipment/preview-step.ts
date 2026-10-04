import { ASSUMED_EQUIPMENT } from "@/db/seed/data/assumed-equipment";
import { EQUIPMENT_COMBINATIONS } from "@/db/seed/data/equipment-combinations";
import { EQUIPMENT_DESCRIPTIONS } from "@/db/seed/data/equipment-descriptions";
import { EQUIPMENT_PRESETS } from "@/db/seed/data/equipment-presets";
import { EQUIPMENT_TYPES } from "@/db/seed/data/equipment-types";
import type { GymKind, TrainingExperience } from "@/domain/types";
import { buildMachinesStep, type MachinesStep } from "@/lib/machines-step";

/**
 * The machines step from the checked-in catalogue alone, each type and combination standing in
 * as its own id: for the development preview and the step's tests, where there is no database.
 * Draft catalogue additions are left out, as production leaves them out.
 */
export function previewMachinesStep(
  kind: GymKind,
  experience: TrainingExperience | null,
  record: { active?: string[]; archived?: string[]; absent?: string[] } = {},
): MachinesStep {
  const types = EQUIPMENT_TYPES.filter((type) => type.review !== "draft").map((type) => ({
    id: type.slug,
    slug: type.slug,
    name: type.name,
    category: type.category,
    purpose: EQUIPMENT_DESCRIPTIONS[type.slug]?.purpose ?? null,
    identification: EQUIPMENT_DESCRIPTIONS[type.slug]?.identification ?? null,
    aliases: [...(EQUIPMENT_DESCRIPTIONS[type.slug]?.aliases ?? [])],
  }));
  return buildMachinesStep({
    gym: {
      id: "00000000-0000-4000-8000-0000000000a1",
      name: kind === "gym" ? "Anytime Fitness" : kind === "home" ? "Home" : "Park",
      kind,
    },
    experience,
    types,
    combinations: EQUIPMENT_COMBINATIONS.filter((c) => c.review !== "draft").map((c) => ({
      id: c.slug,
      slug: c.slug,
      name: c.name,
      purpose: c.purpose,
      identification: c.identification,
      aliases: [...c.aliases],
      typeIds: [...c.types],
    })),
    presets: EQUIPMENT_PRESETS.map((preset) => ({ ...preset, items: [...preset.items] })),
    basics: new Set(ASSUMED_EQUIPMENT[kind]),
    machines: [
      ...(record.active ?? []).map((slug) => ({ isActive: true, typeIds: [slug] })),
      ...(record.archived ?? []).map((slug) => ({ isActive: false, typeIds: [slug] })),
    ],
    absentTypeIds: record.absent ?? [],
  });
}
