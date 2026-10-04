import { EQUIPMENT_FAMILIES } from "@/db/seed/data/equipment-types";
import type { EquipmentCategory, GymKind, TrainingExperience } from "@/domain/types";

/*
 * What the machines step offers a location (plan: onboarding flow), worked out from the
 * catalogue and the place's own record. Pure, so the page, its preview and its tests agree.
 */

/** One thing the step can offer: a type, a family whose variant is asked, or a combination. */
export type StarterItem = {
  /** `type:<id>`, `family:<slug>` or `combination:<id>`. */
  key: string;
  kind: "type" | "family" | "combination";
  /** The drawing's slug: the type's or combination's own; a family uses its first variant's. */
  slug: string;
  name: string;
  purpose: string | null;
  identification: string | null;
  aliases: string[];
  /** For grouping the full list; a combination is grouped on its own. */
  category: EquipmentCategory | "combination";
  /** The types it registers: one, a combination's members, or a family's variants to choose. */
  typeIds: string[];
  /** A family's variants, the commonest first. */
  variants?: StarterVariant[];
};

export type StarterVariant = {
  typeId: string;
  slug: string;
  name: string;
  purpose: string | null;
  identification: string | null;
};

export type MachinesStep = {
  gym: { id: string; name: string; kind: GymKind };
  experience: TrainingExperience | null;
  /** At a gym, the basics taken as here until someone says otherwise; elsewhere none. */
  basics: StarterItem[];
  /** The step's suggestions: a beginner's extras or starter set, or the outdoor set. */
  suggestions: StarterItem[];
  /** Everything else that can be ticked, for the full list and Browse all. */
  catalogue: StarterItem[];
  /** Types on an active machine here: already confirmed, shown as such. */
  activeTypeIds: string[];
  /** Types whose only machine here is archived: ticking one restores it. */
  archivedTypeIds: string[];
  /** Types recorded as not here: a basic shows unticked in its Review, anything else says so. */
  absentTypeIds: string[];
};

export type StepType = {
  id: string;
  slug: string;
  name: string;
  category: EquipmentCategory;
  purpose: string | null;
  identification: string | null;
  aliases: string[];
};

export type StepCombination = {
  id: string;
  slug: string;
  name: string;
  purpose: string | null;
  identification: string | null;
  aliases: string[];
  typeIds: string[];
};

export type StepPreset = {
  gymKind: GymKind;
  experience: string;
  items: ({ type: string } | { family: string } | { combination: string })[];
};

export type StepMachine = { isActive: boolean; typeIds: string[] };

/** Floor work needs nothing registered, so the floor is never offered. */
const NEVER_OFFERED = new Set(["bodyweight"]);

const CATEGORY_ORDER: readonly (EquipmentCategory | "combination")[] = [
  "machine",
  "cable",
  "combination",
  "free_weight",
  "accessory",
  "bodyweight",
  "cardio",
];

function typeItem(type: StepType): StarterItem {
  return {
    key: `type:${type.id}`,
    kind: "type",
    slug: type.slug,
    name: type.name,
    purpose: type.purpose,
    identification: type.identification,
    aliases: type.aliases,
    category: type.category,
    typeIds: [type.id],
  };
}

function combinationItem(combination: StepCombination): StarterItem {
  return {
    key: `combination:${combination.id}`,
    kind: "combination",
    slug: combination.slug,
    name: combination.name,
    purpose: combination.purpose,
    identification: combination.identification,
    aliases: combination.aliases,
    category: "combination",
    typeIds: combination.typeIds,
  };
}

/**
 * The step for one place. Suggestions go only to those who said they are new, and to everyone
 * outdoors; at a gym the basics come first and the full list holds everything else, combinations
 * included; the floor is never offered.
 */
export function buildMachinesStep(input: {
  gym: MachinesStep["gym"];
  experience: TrainingExperience | null;
  types: readonly StepType[];
  combinations: readonly StepCombination[];
  presets: readonly StepPreset[];
  /** The types assumed here: the gym basics at a gym, none elsewhere. */
  basics: ReadonlySet<string>;
  machines: readonly StepMachine[];
  absentTypeIds: readonly string[];
}): MachinesStep {
  const { gym, experience, types, combinations, presets, basics, machines } = input;
  const bySlug = new Map(types.map((type) => [type.slug, type]));
  const offered = types.filter((type) => !NEVER_OFFERED.has(type.slug));
  const active = new Set(machines.filter((m) => m.isActive).flatMap((m) => m.typeIds));
  const archived = new Set(
    machines
      .filter((m) => !m.isActive)
      .flatMap((m) => m.typeIds)
      .filter((id) => !active.has(id)),
  );

  const familyItem = (slug: string): StarterItem | null => {
    const family = EQUIPMENT_FAMILIES[slug];
    // A variant missing from this catalogue (a draft not seeded here) is simply not offered.
    const members = (family?.members ?? []).flatMap((member) => {
      const type = bySlug.get(member);
      return type ? [type] : [];
    });
    if (!family || members.length === 0) return null;
    if (members.length === 1) return typeItem(members[0]!);
    return {
      key: `family:${slug}`,
      kind: "family",
      slug: members[0]!.slug,
      name: family.name,
      purpose: members[0]!.purpose,
      identification: null,
      aliases: members.flatMap((type) => type.aliases),
      category: members[0]!.category,
      typeIds: members.map((type) => type.id),
      variants: members.map((type) => ({
        typeId: type.id,
        slug: type.slug,
        name: type.name,
        purpose: type.purpose,
        identification: type.identification,
      })),
    };
  };

  const preset =
    gym.kind === "outdoor" || experience === "new"
      ? presets.find(
          (p) => p.gymKind === gym.kind && (p.experience === "any" || p.experience === experience),
        )
      : undefined;
  const suggestions = (preset?.items ?? []).flatMap((item): StarterItem[] => {
    if ("type" in item) {
      const type = bySlug.get(item.type);
      return type && !NEVER_OFFERED.has(type.slug) ? [typeItem(type)] : [];
    }
    if ("family" in item) {
      const family = familyItem(item.family);
      return family ? [family] : [];
    }
    const combination = combinations.find((c) => c.slug === item.combination);
    return combination ? [combinationItem(combination)] : [];
  });

  const catalogue = [
    ...offered.filter((type) => !basics.has(type.id)).map(typeItem),
    ...combinations.map(combinationItem),
  ].sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));

  return {
    gym,
    experience,
    basics: offered.filter((type) => basics.has(type.id)).map(typeItem),
    suggestions,
    catalogue,
    activeTypeIds: [...active],
    archivedTypeIds: [...archived],
    absentTypeIds: [...input.absentTypeIds],
  };
}
