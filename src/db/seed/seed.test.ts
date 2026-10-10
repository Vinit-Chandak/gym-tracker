import { asc, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { searchWords } from "@/domain/exercise-search";
import { programBlueprintSchema } from "@/domain/program-blueprint";
import { MUSCLE_GROUPS } from "@/domain/types";

import { EQUIPMENT_ART } from "@/components/equipment-art/catalogue";

import {
  equipmentCombinations,
  equipmentCombinationTypes,
  equipmentPresets,
  equipmentTypes,
  exerciseEquipmentOptions,
  exerciseEquipmentRequirements,
  exerciseGuides,
  exerciseMedia,
  exercises,
  warmupProtocols,
} from "../schema";
import { createTestDatabase, type TestDatabase } from "../test/pglite";
import { ASSUMED_EQUIPMENT } from "./data/assumed-equipment";
import { DRAFT_COMBINATION_ALIASES, EQUIPMENT_COMBINATIONS } from "./data/equipment-combinations";
import {
  DRAFT_EQUIPMENT_ALIASES,
  EQUIPMENT_DESCRIPTIONS,
  PROPOSED_ALIAS_MOVES,
} from "./data/equipment-descriptions";
import { EQUIPMENT_PRESETS } from "./data/equipment-presets";
import { EQUIPMENT_FAMILIES, EQUIPMENT_TYPES } from "./data/equipment-types";
import { DRAFT_EXERCISE_ALIASES, EXERCISE_ALIASES } from "./data/exercise-aliases";
import { EXERCISES, MAPPING_CLASSES, requirementGroups, type ExerciseSeed } from "./data/exercises";
import { GUIDES, MEDIA } from "./data/guides";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "./data/program";
import { PROGRAM_TEMPLATES } from "./data/templates";
import { WARMUP_PROTOCOLS } from "./data/warmups";
import { referenceManifests, seededExercise, seedReferenceData } from "./reference";

const exerciseBySlug = new Map(EXERCISES.map((e) => [e.slug, e]));
const equipmentTypeSlugs = new Set(EQUIPMENT_TYPES.map((t) => t.slug));
const warmupSlugs = new Set(WARMUP_PROTOCOLS.map((w) => w.slug));

describe("shared reference data", () => {
  it("has unique slugs everywhere", () => {
    expect(new Set(EXERCISES.map((e) => e.slug)).size).toBe(EXERCISES.length);
    expect(equipmentTypeSlugs.size).toBe(EQUIPMENT_TYPES.length);
    expect(warmupSlugs.size).toBe(WARMUP_PROTOCOLS.length);
  });

  it("only references known equipment types and muscle groups", () => {
    const muscles = new Set<string>(MUSCLE_GROUPS);
    for (const e of EXERCISES) {
      expect(e.equipment.length, e.slug).toBeGreaterThan(0);
      for (const slug of requirementGroups(e).flat())
        expect(equipmentTypeSlugs.has(slug), `${e.slug} → ${slug}`).toBe(true);
      for (const m of [...e.primaryMuscles, ...(e.secondaryMuscles ?? [])]) {
        expect(muscles.has(m), `${e.slug} → ${m}`).toBe(true);
      }
    }
  });

  it("covers every body region and modality a new account might log", () => {
    const modalities = new Set(EXERCISES.map((e) => e.modality));
    expect([...modalities].sort()).toEqual([
      "barbell",
      "bodyweight",
      "cable",
      "cardio",
      "dumbbell",
      "machine",
      "smith_machine",
    ]);
    // Every muscle group is the primary target of something in the library.
    const primary = new Set(EXERCISES.flatMap((e) => e.primaryMuscles));
    expect(MUSCLE_GROUPS.filter((m) => !primary.has(m))).toEqual([]);
  });

  it("gives every exercise the range of whatever it is measured in", () => {
    for (const e of EXERCISES) {
      const measure = e.measure ?? "reps";
      const range = {
        reps: [e.defaultRepMin, e.defaultRepMax],
        duration: [e.defaultDurationMin, e.defaultDurationMax],
        distance: [e.defaultDistanceMin, e.defaultDistanceMax],
      }[measure];
      // Cardio is the exception: it is prescribed by the plan, not by a default set range.
      if (e.category === "cardio") continue;
      expect(
        range.every((v) => typeof v === "number"),
        `${e.slug} (${measure})`,
      ).toBe(true);
      expect(range[0]! <= range[1]!, e.slug).toBe(true);
      // Nothing carries a range it is not measured in, which would be a silent contradiction.
      const others = (["reps", "duration", "distance"] as const).filter((m) => m !== measure);
      for (const other of others) {
        const stray = {
          reps: [e.defaultRepMin, e.defaultRepMax],
          duration: [e.defaultDurationMin, e.defaultDurationMax],
          distance: [e.defaultDistanceMin, e.defaultDistanceMax],
        }[other];
        expect(stray, `${e.slug} carries a ${other} range but is measured in ${measure}`).toEqual([
          undefined,
          undefined,
        ]);
      }
    }
  });

  it("seeds nothing that belongs to a person", () => {
    // Gyms, machines at a gym and programmes are created by users, never by the seed.
    const seedModules = ["equipment-types", "exercises", "program", "templates", "warmups"];
    expect(seedModules).not.toContain("gyms");
  });
});

describe("permanent slugs", () => {
  it("names equipment with underscores and exercises with hyphens, none of them custom", () => {
    for (const type of EQUIPMENT_TYPES) expect(type.slug).toMatch(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);
    for (const combination of EQUIPMENT_COMBINATIONS)
      expect(combination.slug).toMatch(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);
    for (const exercise of EXERCISES) {
      expect(exercise.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      // `custom-` belongs to the athletes' own exercises, which share the unique column.
      expect(exercise.slug.startsWith("custom-"), exercise.slug).toBe(false);
    }
  });

  it("gives every equipment type its own place in the catalogue's order", () => {
    const orders = EQUIPMENT_TYPES.map((type) => type.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it("never lets a drawing key mean two things", () => {
    const combinationSlugs = EQUIPMENT_COMBINATIONS.map((c) => c.slug);
    expect(combinationSlugs.filter((slug) => equipmentTypeSlugs.has(slug))).toEqual([]);
    for (const key of Object.keys(EQUIPMENT_ART))
      expect(equipmentTypeSlugs.has(key) || combinationSlugs.includes(key), key).toBe(true);
  });
});

describe("requirement groups", () => {
  it("gives every exercise groups of known, distinct types with the primary first", () => {
    for (const exercise of EXERCISES) {
      const groups = requirementGroups(exercise);
      expect(groups.length, exercise.slug).toBeGreaterThan(0);
      for (const group of groups) {
        expect(group.length, exercise.slug).toBeGreaterThan(0);
        expect(new Set(group).size, `${exercise.slug} repeats a type in a group`).toBe(
          group.length,
        );
        // The floor is "no equipment": it never shares a group with something real.
        if (group.includes("bodyweight")) expect(group, exercise.slug).toEqual(["bodyweight"]);
      }
      const keys = groups.map((group) => group.join("+"));
      expect(new Set(keys).size, `${exercise.slug} lists one alternative twice`).toBe(keys.length);
    }
  });

  it("records what every corrected mapping was, and why it changed", () => {
    const corrected = EXERCISES.filter((exercise) => exercise.correction);
    expect(corrected.length).toBeGreaterThan(0);
    for (const exercise of corrected) {
      const { kinds, was } = exercise.correction!;
      expect(kinds.length, exercise.slug).toBeGreaterThan(0);
      for (const kind of kinds) expect(Object.keys(MAPPING_CLASSES)).toContain(kind);
      expect(was.length, exercise.slug).toBeGreaterThan(0);
      for (const slug of was) expect(equipmentTypeSlugs.has(slug), slug).toBe(true);
    }
  });

  it("settles the cases the plan named", () => {
    // As production seeds them, without the ways to do them that await the owner.
    const seeded = new Map(referenceManifests({ drafts: false }).exercises.map((e) => [e.slug, e]));
    const groups = (slug: string) => requirementGroups(seeded.get(slug)!);
    // Needed together: a bench alone is never a Smith machine.
    expect(groups("smith-hip-thrust")).toEqual([["smith_machine", "flat_bench"]]);
    expect(groups("flat-db-press")).toEqual([["dumbbells", "flat_bench"]]);
    expect(groups("front-squat")).toEqual([["barbell", "power_rack"]]);
    expect(groups("landmine-press")).toEqual([["landmine", "barbell"]]);
    expect(groups("db-floor-press")).toEqual([["dumbbells"]]);
    // Another exercise's machine: the assisted dip machine belongs to the assisted dip.
    expect(groups("dip").flat()).not.toContain("dip_machine");
    expect(groups("chest-dip").flat()).not.toContain("dip_machine");
    expect(groups("assisted-dip")).toEqual([["dip_machine"]]);
    expect(groups("crunch").flat()).not.toContain("ab_crunch_machine");
    expect(groups("db-front-raise").flat()).not.toContain("cable_station");
    expect(groups("glute-kickback-machine").flat()).not.toContain("cable_station");
    expect(groups("cable-kickback").flat()).not.toContain("glute_kickback_machine");
    expect(groups("trap-bar-deadlift")).toEqual([["trap_bar"]]);
    // Attachments are not machines.
    expect(groups("reverse-cable-curl").flat()).not.toContain("ez_bar");
    expect(groups("cable-upright-row").flat()).not.toContain("ez_bar");
    // Essentials a gym assumed.
    expect(groups("barbell-bench-press")).toEqual([["barbell", "flat_bench", "power_rack"]]);
    expect(groups("high-bar-squat")).toEqual([["barbell", "power_rack"]]);
  });
});

describe("assumed equipment", () => {
  it("assumes the gym basics at a gym and nothing at home or outdoors", () => {
    for (const slug of ASSUMED_EQUIPMENT.gym) expect(equipmentTypeSlugs.has(slug), slug).toBe(true);
    expect(new Set(ASSUMED_EQUIPMENT.gym).size).toBe(ASSUMED_EQUIPMENT.gym.length);
    expect(ASSUMED_EQUIPMENT.home).toEqual([]);
    expect(ASSUMED_EQUIPMENT.outdoor).toEqual([]);
    // Specialty bars are not basics (owner decision).
    for (const slug of ["trap_bar", "safety_squat_bar", "swiss_bar"])
      expect(ASSUMED_EQUIPMENT.gym).not.toContain(slug);
    for (const slug of ["pull_up_bar", "dip_station", "back_extension_bench", "pec_deck"])
      expect(ASSUMED_EQUIPMENT.gym).toContain(slug);
  });

  it("assumes one variant of each family, the first", () => {
    for (const { members } of Object.values(EQUIPMENT_FAMILIES)) {
      const assumed = members.filter((slug) => ASSUMED_EQUIPMENT.gym.includes(slug));
      expect(assumed.length).toBeLessThanOrEqual(1);
      if (assumed.length) expect(assumed[0]).toBe(members[0]);
    }
  });
});

describe("families, combinations and presets", () => {
  it("puts each type in at most one family, every member known", () => {
    const seen = new Set<string>();
    for (const [family, { members }] of Object.entries(EQUIPMENT_FAMILIES)) {
      expect(members.length, family).toBeGreaterThan(1);
      for (const slug of members) {
        expect(equipmentTypeSlugs.has(slug), slug).toBe(true);
        expect(seen.has(slug), `${slug} is in two families`).toBe(false);
        seen.add(slug);
      }
    }
    for (const type of EQUIPMENT_TYPES)
      if (type.family) expect(EQUIPMENT_FAMILIES[type.family]?.members).toContain(type.slug);
  });

  it("makes every combination of two or more known types", () => {
    expect(new Set(EQUIPMENT_COMBINATIONS.map((c) => c.slug)).size).toBe(
      EQUIPMENT_COMBINATIONS.length,
    );
    for (const combination of EQUIPMENT_COMBINATIONS) {
      expect(combination.types.length, combination.slug).toBeGreaterThan(1);
      expect(new Set(combination.types).size).toBe(combination.types.length);
      for (const slug of combination.types) expect(equipmentTypeSlugs.has(slug), slug).toBe(true);
    }
    expect(EQUIPMENT_COMBINATIONS.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        "Lat pulldown and low row",
        "Assisted dip and chin",
        "Leg extension and curl",
      ]),
    );
  });

  it("suggests only what exists, within the display limit", () => {
    const families = new Set(Object.keys(EQUIPMENT_FAMILIES));
    const combinations = new Set(EQUIPMENT_COMBINATIONS.map((c) => c.slug));
    for (const preset of EQUIPMENT_PRESETS) {
      for (const item of preset.items) {
        if ("type" in item) expect(equipmentTypeSlugs.has(item.type), item.type).toBe(true);
        else if ("family" in item) expect(families.has(item.family), item.family).toBe(true);
        else expect(combinations.has(item.combination), item.combination).toBe(true);
      }
      // "Bodyweight / floor" is never something to register.
      expect(preset.items).not.toContainEqual({ type: "bodyweight" });
    }
    const extras = EQUIPMENT_PRESETS.find((p) => p.slug === "gym-new-extras")!;
    expect(extras.items.length).toBeGreaterThanOrEqual(8);
    expect(extras.items.length).toBeLessThanOrEqual(12);
    // Extras are what is not already assumed.
    for (const item of extras.items)
      if ("type" in item) expect(ASSUMED_EQUIPMENT.gym).not.toContain(item.type);
    const outdoor = EQUIPMENT_PRESETS.find((p) => p.gymKind === "outdoor")!;
    expect(outdoor.items).toEqual([
      { type: "pull_up_bar" },
      { type: "dip_station" },
      { type: "flat_bench" },
      { type: "plyo_box" },
    ]);
  });
});

describe("names, aliases and descriptions", () => {
  it("describes every equipment type in a few plain words", () => {
    expect(Object.keys(EQUIPMENT_DESCRIPTIONS).sort()).toEqual([...equipmentTypeSlugs].sort());
    for (const type of EQUIPMENT_TYPES) {
      const description = EQUIPMENT_DESCRIPTIONS[type.slug]!;
      expect(description.purpose.length, type.slug).toBeGreaterThan(0);
      expect(description.purpose.length, type.slug).toBeLessThanOrEqual(70);
      expect(description.identification.length, type.slug).toBeLessThanOrEqual(200);
      const names = description.aliases.map((alias) => alias.toLowerCase());
      expect(names, type.slug).not.toContain(type.name.toLowerCase());
      expect(new Set(names).size, type.slug).toBe(names.length);
    }
  });

  it("calls both the back-extension bench and the captain's chair a Roman chair", () => {
    // An alias that names two things shows both, side by side, rather than guessing.
    expect(EQUIPMENT_DESCRIPTIONS.back_extension_bench?.aliases).toContain("Roman chair");
    expect(EQUIPMENT_DESCRIPTIONS.captains_chair?.aliases).toContain("Roman chair");
    expect(EQUIPMENT_TYPES.find((t) => t.slug === "captains_chair")?.name).toBe("Captain's chair");
  });

  it("gives aliases only to exercises that exist, never repeating the name", () => {
    for (const [slug, aliases] of Object.entries(EXERCISE_ALIASES)) {
      const exercise = exerciseBySlug.get(slug);
      expect(exercise, slug).toBeDefined();
      expect(
        aliases.map((a) => a.toLowerCase()),
        slug,
      ).not.toContain(exercise!.name.toLowerCase());
    }
  });
});

describe("guides and demonstrations", () => {
  it("writes each guide for a known exercise, in the shape a reviewer can check", () => {
    const seen = new Set<string>();
    for (const guide of GUIDES) {
      expect(exerciseBySlug.has(guide.exercise), guide.exercise).toBe(true);
      expect(seen.has(guide.exercise), `two guides for ${guide.exercise}`).toBe(false);
      seen.add(guide.exercise);
      expect(guide.setup.length, guide.exercise).toBeGreaterThan(0);
      expect(guide.steps.length, guide.exercise).toBeGreaterThanOrEqual(3);
      expect(guide.steps.length, guide.exercise).toBeLessThanOrEqual(6);
      expect(guide.cues.length, guide.exercise).toBeGreaterThanOrEqual(2);
      expect(guide.cues.length, guide.exercise).toBeLessThanOrEqual(3);
      expect(guide.mistakes.length, guide.exercise).toBeGreaterThanOrEqual(2);
      expect(guide.mistakes.length, guide.exercise).toBeLessThanOrEqual(4);
      expect(guide.sources.length, guide.exercise).toBeGreaterThan(0);
      for (const source of guide.sources) expect(source.url).toMatch(/^https:\/\//);
      // Nothing is published without a named reviewer and a date.
      if (guide.status === "published") {
        expect(guide.reviewer, guide.exercise).toBeTruthy();
        expect(guide.reviewedOn, guide.exercise).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("links each demonstration to YouTube by a real-looking id, checked on a date", () => {
    for (const item of MEDIA) {
      expect(exerciseBySlug.has(item.exercise), item.exercise).toBe(true);
      expect(item.videoId).toMatch(/^[A-Za-z0-9_-]{11}$/);
      expect(item.url).toContain(item.videoId);
      expect(item.url.startsWith("https://www.youtube.com/")).toBe(true);
      expect(item.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("drafts", () => {
  it("keeps every published entry free of anything unpublished", () => {
    expect(() => referenceManifests({ drafts: false })).not.toThrow();
    expect(() => referenceManifests({ drafts: true })).not.toThrow();
  });

  it("leaves drafts out unless they are asked for", () => {
    const published = referenceManifests({ drafts: false });
    expect(published.types.some((type) => type.review === "draft")).toBe(false);
    expect(published.exercises.some((exercise) => exercise.review === "draft")).toBe(false);
    expect(published.combinations.some((combination) => combination.review === "draft")).toBe(
      false,
    );
    const all = referenceManifests({ drafts: true });
    expect(all.types.length).toBe(EQUIPMENT_TYPES.length);
    expect(all.exercises.length).toBe(EXERCISES.length);
    expect(all.combinations.length).toBe(EQUIPMENT_COMBINATIONS.length);
  });
});

/**
 * The catalogue additions awaiting the owner (docs/planning/catalogue-additions.md). Approving one
 * is taking away its `review: "draft"`, or moving a drafted alias into the published entry, and
 * taking its line out of this list.
 */
const AWAITING = {
  types: [
    "high_row_machine",
    "seated_row_machine",
    "decline_press_machine",
    "lever_squat_machine",
    "multi_hip_machine",
    "flat_bench_press_station",
    "incline_bench_press_station",
    "military_press_bench",
  ],
  combinations: [
    "leg_extension_lying_curl",
    "hip_abduction_adduction",
    "multi_press",
    "leg_press_hack_squat",
    "biceps_triceps_machine",
    "knee_raise_dip_pull_up_tower",
    "ab_crunch_back_extension",
    "chest_press_lat_pulldown",
  ],
  // The rest of the researched exercises were published in October 2026; these wait for their types.
  exercises: ["decline-press-machine", "lever-squat", "machine-high-row"],
  /** Ways to do a published exercise on a draft type, which wait with the type. */
  alternatives: [
    "barbell-bench-press: barbell + flat_bench_press_station",
    "incline-barbell-bench: barbell + incline_bench_press_station",
    "close-grip-bench-press: barbell + flat_bench_press_station",
    "incline-db-press: dumbbells + incline_bench_press_station",
    "seated-db-shoulder-press: dumbbells + military_press_bench",
    "chest-supported-row: seated_row_machine",
    "flat-db-press: dumbbells + flat_bench_press_station",
    "glute-kickback-machine: multi_hip_machine",
    "seated-barbell-press: barbell + military_press_bench",
  ],
};

/** A name as search compares it: case, punctuation, spacing, plurals and small words aside. */
const searchKey = (text: string) => searchWords(text).join("");
const slugsOf = (items: readonly { slug: string }[]) => items.map((item) => item.slug);
const groupText = (group: readonly string[]) => group.join(" + ");

describe("catalogue additions awaiting approval", () => {
  const published = referenceManifests({ drafts: false });
  const all = referenceManifests({ drafts: true });
  const manifestGroups = (slug: string) => requirementGroups(exerciseBySlug.get(slug)!);

  it("marks exactly the researched additions as drafts", () => {
    const drafted = <T extends { slug: string; review?: "draft" }>(items: readonly T[]) =>
      slugsOf(items.filter((item) => item.review === "draft"));
    expect(drafted(EQUIPMENT_TYPES)).toEqual(AWAITING.types);
    expect(drafted(EQUIPMENT_COMBINATIONS)).toEqual(AWAITING.combinations);
    expect(drafted(EXERCISES)).toEqual(AWAITING.exercises);
    const draftTypes = new Set(AWAITING.types);
    const waiting = EXERCISES.filter((e) => e.review !== "draft").flatMap((e) =>
      requirementGroups(e)
        .filter((group) => group.some((slug) => draftTypes.has(slug)))
        .map((group) => `${e.slug}: ${groupText(group)}`),
    );
    expect(waiting.sort()).toEqual([...AWAITING.alternatives].sort());
  });

  it("seeds none of them, nor their aliases, where drafts are off", () => {
    const types = new Set(slugsOf(published.types));
    for (const slug of AWAITING.types) expect(types.has(slug), slug).toBe(false);
    const exerciseSlugs = new Set(slugsOf(published.exercises));
    for (const slug of AWAITING.exercises) expect(exerciseSlugs.has(slug), slug).toBe(false);
    const combinationSlugs = new Set(slugsOf(published.combinations));
    for (const slug of AWAITING.combinations) expect(combinationSlugs.has(slug), slug).toBe(false);
    // Nothing published points at a draft: no group, combination member, preset or basic.
    for (const exercise of published.exercises)
      for (const slug of requirementGroups(exercise).flat())
        expect(types.has(slug), `${exercise.slug} → ${slug}`).toBe(true);
    for (const combination of published.combinations)
      for (const slug of combination.types) expect(types.has(slug), slug).toBe(true);
    for (const preset of published.presets)
      for (const item of preset.items) if ("type" in item) expect(types.has(item.type)).toBe(true);
    for (const row of published.assumed) expect(types.has(row.slug), row.slug).toBe(true);
    // Every name is the published one: no drafted alias anywhere.
    for (const type of published.types)
      expect(published.equipmentAliases[type.slug], type.slug).toEqual(
        EQUIPMENT_DESCRIPTIONS[type.slug]?.aliases ?? [],
      );
    for (const exercise of published.exercises)
      expect(published.exerciseAliases[exercise.slug], exercise.slug).toEqual(
        EXERCISE_ALIASES[exercise.slug] ?? [],
      );
    for (const combination of published.combinations)
      expect(combination.aliases, combination.slug).toEqual(
        EQUIPMENT_COMBINATIONS.find((c) => c.slug === combination.slug)!.aliases,
      );
  });

  it("leaves every published exercise at least one whole way to be done, as written", () => {
    for (const exercise of published.exercises) {
      const groups = requirementGroups(exercise).map(groupText);
      const written = manifestGroups(exercise.slug).map(groupText);
      expect(groups.length, exercise.slug).toBeGreaterThan(0);
      // Kept whole, primary first, in the order written: only the draft ways are missing.
      expect(
        written.filter((group) => groups.includes(group)),
        exercise.slug,
      ).toEqual(groups);
      expect(
        written.filter((group) => !groups.includes(group)).map((g) => `${exercise.slug}: ${g}`),
      ).toEqual(AWAITING.alternatives.filter((a) => a.startsWith(`${exercise.slug}: `)));
    }
  });

  it("drops a draft way whole, never shortened, and never leaves a published exercise none", () => {
    const environment = {
      drafts: false,
      seeded: new Set(["barbell", "flat_bench", "power_rack"]),
      known: new Set(["barbell", "flat_bench", "power_rack", "flat_bench_press_station"]),
    };
    const example = (equipment: ExerciseSeed["equipment"], review?: "draft"): ExerciseSeed => ({
      ...exerciseBySlug.get("barbell-bench-press")!,
      slug: "example",
      equipment,
      review,
    });
    // Whether the draft type is the primary or a type used with it, its group goes whole.
    expect(
      seededExercise(
        example([
          "barbell",
          ["flat_bench_press_station", "barbell"],
          ["barbell", "flat_bench_press_station"],
          ["barbell", "flat_bench", "power_rack"],
        ]),
        environment,
      )?.equipment,
    ).toEqual(["barbell", ["barbell", "flat_bench", "power_rack"]]);
    // Nothing to drop: the entry as it is.
    const whole = example([["barbell", "power_rack"]]);
    expect(seededExercise(whole, environment)).toBe(whole);
    // Only draft ways left: a published exercise is refused, a draft one waits.
    expect(() =>
      seededExercise(example([["barbell", "flat_bench_press_station"]]), environment),
    ).toThrow(/needs unseeded equipment for every way to do it: flat_bench_press_station/);
    expect(seededExercise(example(["barbell"], "draft"), environment)).toBeNull();
    expect(
      seededExercise(example(["flat_bench_press_station"], "draft"), {
        ...environment,
        drafts: true,
      }),
    ).toBeNull();
    // A type nobody wrote is a mistake, drafts or not.
    expect(() => seededExercise(example(["barbel"]), environment)).toThrow(/unknown equipment/);
  });

  it("seeds every one of them, with valid references, where drafts are on", () => {
    expect(slugsOf(all.types)).toEqual(slugsOf(EQUIPMENT_TYPES));
    expect(slugsOf(all.exercises)).toEqual(slugsOf(EXERCISES));
    expect(slugsOf(all.combinations)).toEqual(slugsOf(EQUIPMENT_COMBINATIONS));
    const types = new Set(slugsOf(all.types));
    for (const exercise of all.exercises) {
      // Every way, as written.
      expect(requirementGroups(exercise), exercise.slug).toEqual(manifestGroups(exercise.slug));
      for (const slug of requirementGroups(exercise).flat())
        expect(types.has(slug), `${exercise.slug} → ${slug}`).toBe(true);
    }
    for (const combination of all.combinations)
      for (const slug of combination.types) expect(types.has(slug), slug).toBe(true);
    for (const { members } of Object.values(EQUIPMENT_FAMILIES))
      for (const slug of members) expect(types.has(slug), slug).toBe(true);
    // A draft type carries its own description; a published item gains its drafted aliases.
    for (const slug of AWAITING.types)
      expect(all.equipmentAliases[slug]).toEqual(EQUIPMENT_DESCRIPTIONS[slug]!.aliases);
    for (const [slug, aliases] of Object.entries(DRAFT_EQUIPMENT_ALIASES))
      expect(all.equipmentAliases[slug]).toEqual([
        ...(EQUIPMENT_DESCRIPTIONS[slug]?.aliases ?? []),
        ...aliases,
      ]);
    for (const [slug, aliases] of Object.entries(DRAFT_EXERCISE_ALIASES))
      expect(all.exerciseAliases[slug]).toEqual([...(EXERCISE_ALIASES[slug] ?? []), ...aliases]);
    for (const [slug, aliases] of Object.entries(DRAFT_COMBINATION_ALIASES))
      expect(all.combinations.find((c) => c.slug === slug)?.aliases).toEqual([
        ...EQUIPMENT_COMBINATIONS.find((c) => c.slug === slug)!.aliases,
        ...aliases,
      ]);
  });

  it("keeps a family whole without its draft member", () => {
    const types = new Set(slugsOf(published.types));
    for (const [family, { members }] of Object.entries(EQUIPMENT_FAMILIES)) {
      const seeded = members.filter((slug) => types.has(slug));
      // The first member, the one a gym may be assumed to have, is never a draft.
      expect(seeded[0], family).toBe(members[0]);
      expect(seeded.length, family).toBeGreaterThan(1);
    }
    expect(all.types.find((t) => t.slug === "decline_press_machine")?.family).toBe("chest_press");
  });

  it("drafts aliases only for published items, each a name search did not know", () => {
    // Drafted aliases belong to items already published; a draft item carries its own.
    const publishedTypes = new Set(slugsOf(published.types));
    const publishedExercises = new Set(slugsOf(published.exercises));
    const publishedCombinations = new Set(slugsOf(published.combinations));
    for (const slug of Object.keys(DRAFT_EQUIPMENT_ALIASES))
      expect(publishedTypes.has(slug), slug).toBe(true);
    for (const slug of Object.keys(DRAFT_EXERCISE_ALIASES))
      expect(publishedExercises.has(slug), slug).toBe(true);
    for (const slug of Object.keys(DRAFT_COMBINATION_ALIASES))
      expect(publishedCombinations.has(slug), slug).toBe(true);
    // An added name that search already reads as the item's name or one of its aliases
    // ("Biceps triceps machine" for the biceps and triceps machine) adds nothing.
    const additions = [
      ...all.types.map((t) => ({
        slug: t.slug,
        name: t.name,
        aliases: all.equipmentAliases[t.slug] ?? [],
        added:
          t.review === "draft"
            ? (EQUIPMENT_DESCRIPTIONS[t.slug]?.aliases ?? [])
            : (DRAFT_EQUIPMENT_ALIASES[t.slug] ?? []),
      })),
      ...all.combinations.map((c) => ({
        slug: c.slug,
        name: c.name,
        aliases: c.aliases,
        added: c.review === "draft" ? c.aliases : (DRAFT_COMBINATION_ALIASES[c.slug] ?? []),
      })),
      ...all.exercises.map((e) => ({
        slug: e.slug,
        name: e.name,
        aliases: all.exerciseAliases[e.slug] ?? [],
        added:
          e.review === "draft"
            ? (EXERCISE_ALIASES[e.slug] ?? [])
            : (DRAFT_EXERCISE_ALIASES[e.slug] ?? []),
      })),
    ];
    let count = 0;
    for (const item of additions) {
      const keys = [item.name, ...item.aliases].map(searchKey);
      for (const alias of item.added) {
        count += 1;
        // Once, as itself: never the name again, nor a second spelling of another alias.
        expect(
          keys.filter((key) => key === searchKey(alias)),
          `${item.slug}: ${alias}`,
        ).toHaveLength(1);
      }
    }
    expect(count).toBeGreaterThan(0);
  });

  it("never drafts an alias that is another item's name", () => {
    const equipmentNames = new Map(
      [...all.types, ...all.combinations].map((item) => [searchKey(item.name), item.slug]),
    );
    const exerciseNames = new Map(all.exercises.map((e) => [searchKey(e.name), e.slug]));
    const drafted = (
      names: Map<string, string>,
      entries: [string, readonly string[]][],
    ): string[] =>
      entries.flatMap(([slug, aliases]) =>
        aliases
          .filter((alias) => (names.get(searchKey(alias)) ?? slug) !== slug)
          .map((alias) => `${slug}: ${alias}`),
      );
    const draftTypes = EQUIPMENT_TYPES.filter((t) => t.review === "draft");
    const draftCombinations = EQUIPMENT_COMBINATIONS.filter((c) => c.review === "draft");
    expect(
      drafted(equipmentNames, [
        ...Object.entries(DRAFT_EQUIPMENT_ALIASES),
        ...Object.entries(DRAFT_COMBINATION_ALIASES),
        ...draftTypes.map((t): [string, readonly string[]] => [
          t.slug,
          EQUIPMENT_DESCRIPTIONS[t.slug]!.aliases,
        ]),
        ...draftCombinations.map((c): [string, readonly string[]] => [c.slug, c.aliases]),
      ]),
    ).toEqual([]);
    expect(
      drafted(exerciseNames, [
        ...Object.entries(DRAFT_EXERCISE_ALIASES),
        ...AWAITING.exercises.map((slug): [string, readonly string[]] => [
          slug,
          EXERCISE_ALIASES[slug] ?? [],
        ]),
      ]),
    ).toEqual([]);
  });

  it("leaves the moves the research proposed for the owner to make", () => {
    // Moving these names to the new items now would take them from production's search while
    // the new items are not there: they move when the owner approves.
    expect(PROPOSED_ALIAS_MOVES.map((move) => move.alias)).toEqual([
      "Seated row machine",
      "Bench press station",
      "Power tower",
    ]);
    const draftItems = new Set([...AWAITING.types, ...AWAITING.combinations]);
    for (const move of PROPOSED_ALIAS_MOVES) {
      expect(published.equipmentAliases[move.from], move.alias).toContain(move.alias);
      expect(draftItems.has(move.to), move.to).toBe(true);
    }
  });

  it("describes every combination in a few plain words", () => {
    for (const combination of EQUIPMENT_COMBINATIONS) {
      expect(combination.purpose.length, combination.slug).toBeGreaterThan(0);
      expect(combination.purpose.length, combination.slug).toBeLessThanOrEqual(70);
      expect(combination.identification.length, combination.slug).toBeLessThanOrEqual(200);
      const names = combination.aliases.map((alias) => alias.toLowerCase());
      expect(names, combination.slug).not.toContain(combination.name.toLowerCase());
      expect(new Set(names).size, combination.slug).toBe(names.length);
    }
    const orders = EQUIPMENT_COMBINATIONS.map((combination) => combination.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
  });
});

describe("drafts in a database", () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDatabase();
  });

  afterAll(async () => {
    await t.close();
  });

  /** Every shared row's id, with what the seed rebuilds written out by slug. */
  async function snapshot() {
    const types = await t.db
      .select({ id: equipmentTypes.id, slug: equipmentTypes.slug, aliases: equipmentTypes.aliases })
      .from(equipmentTypes)
      .orderBy(asc(equipmentTypes.slug));
    const library = await t.db
      .select({ id: exercises.id, slug: exercises.slug, aliases: exercises.aliases })
      .from(exercises)
      .where(isNull(exercises.userId))
      .orderBy(asc(exercises.slug));
    const combinations = await t.db
      .select({
        id: equipmentCombinations.id,
        slug: equipmentCombinations.slug,
        aliases: equipmentCombinations.aliases,
      })
      .from(equipmentCombinations)
      .orderBy(asc(equipmentCombinations.slug));
    const presets = await t.db
      .select({
        id: equipmentPresets.id,
        slug: equipmentPresets.slug,
        items: equipmentPresets.items,
      })
      .from(equipmentPresets)
      .orderBy(asc(equipmentPresets.slug));
    const warmups = await t.db
      .select({ id: warmupProtocols.id, slug: warmupProtocols.slug })
      .from(warmupProtocols)
      .orderBy(asc(warmupProtocols.slug));
    const typeSlug = new Map(types.map((row) => [row.id, row.slug]));
    const exerciseSlug = new Map(library.map((row) => [row.id, row.slug]));
    const combinationSlug = new Map(combinations.map((row) => [row.id, row.slug]));
    const requirements = (
      await t.db
        .select()
        .from(exerciseEquipmentRequirements)
        .where(isNull(exerciseEquipmentRequirements.userId))
    )
      .map(
        (row) =>
          `${exerciseSlug.get(row.exerciseId)} ${row.alternative} ` +
          `${typeSlug.get(row.equipmentTypeId)}${row.isPrimary ? " (primary)" : ""}`,
      )
      .sort();
    const options = (
      await t.db
        .select()
        .from(exerciseEquipmentOptions)
        .where(isNull(exerciseEquipmentOptions.userId))
    )
      .map(
        (row) =>
          `${exerciseSlug.get(row.exerciseId)} ${row.preferenceRank} ` +
          `${typeSlug.get(row.equipmentTypeId!)}`,
      )
      .sort();
    const members = (await t.db.select().from(equipmentCombinationTypes))
      .map(
        (row) =>
          `${combinationSlug.get(row.combinationId)} ${row.position} ` +
          `${typeSlug.get(row.equipmentTypeId)}`,
      )
      .sort();
    return { types, library, combinations, presets, warmups, requirements, options, members };
  }

  type Snapshot = Awaited<ReturnType<typeof snapshot>>;

  /** Each seeded exercise's ways to do it, as the database holds them, primary first. */
  function waysOf(state: Snapshot): Map<string, string[][]> {
    const ways = new Map<string, Map<number, { primary: string[]; rest: string[] }>>();
    for (const line of state.requirements) {
      const [exercise, alternative, type, primary] = line.split(" ");
      const byNumber = ways.get(exercise!) ?? new Map();
      const entry = byNumber.get(Number(alternative)) ?? { primary: [], rest: [] };
      (primary ? entry.primary : entry.rest).push(type!);
      byNumber.set(Number(alternative), entry);
      ways.set(exercise!, byNumber);
    }
    return new Map(
      [...ways].map(([exercise, byNumber]) => [
        exercise,
        [...byNumber]
          .sort(([a], [b]) => a - b)
          .map(([, entry]) => {
            // Exactly one primary in every way.
            expect(entry.primary, exercise).toHaveLength(1);
            return [...entry.primary, ...entry.rest.sort()];
          }),
      ]),
    );
  }

  /** The manifest's ways, with the types used alongside the primary in the same order. */
  const asWritten = (exercise: ExerciseSeed) =>
    requirementGroups(exercise).map(([primary, ...rest]) => [primary!, ...rest.sort()]);

  it("seeds no draft in production mode, every exercise with valid ways, twice the same", async () => {
    await seedReferenceData(t.db, { drafts: false });
    const first = await snapshot();
    const published = referenceManifests({ drafts: false });
    expect(slugsOf(first.types)).toEqual(slugsOf(published.types).sort());
    expect(slugsOf(first.library)).toEqual(slugsOf(published.exercises).sort());
    expect(slugsOf(first.combinations)).toEqual(slugsOf(published.combinations).sort());
    const lines = [...first.requirements, ...first.options, ...first.members].join("\n");
    for (const slug of AWAITING.types) expect(lines).not.toContain(` ${slug}`);
    // Each exercise has the ways written for it, less those on a draft type, every one whole.
    const ways = waysOf(first);
    const draftTypes = new Set(AWAITING.types);
    for (const exercise of published.exercises)
      expect(ways.get(exercise.slug), exercise.slug).toEqual(
        asWritten(exerciseBySlug.get(exercise.slug)!).filter(
          (group) => !group.some((slug) => draftTypes.has(slug)),
        ),
      );
    // Every row has its published names and no drafted one.
    for (const row of first.types)
      expect(row.aliases, row.slug).toEqual(published.equipmentAliases[row.slug]);
    for (const row of first.library)
      expect(row.aliases, row.slug).toEqual(published.exerciseAliases[row.slug]);
    for (const row of first.combinations)
      expect(row.aliases, row.slug).toEqual(
        published.combinations.find((c) => c.slug === row.slug)?.aliases,
      );
    const unwanted = (
      rows: { slug: string; aliases: string[] }[],
      drafts: Readonly<Record<string, readonly string[]>>,
    ) =>
      Object.entries(drafts).flatMap(([slug, drafted]) =>
        (rows.find((row) => row.slug === slug)?.aliases ?? [])
          .filter((alias) => drafted.includes(alias))
          .map((alias) => `${slug}: ${alias}`),
      );
    expect(unwanted(first.types, DRAFT_EQUIPMENT_ALIASES)).toEqual([]);
    expect(unwanted(first.library, DRAFT_EXERCISE_ALIASES)).toEqual([]);
    expect(unwanted(first.combinations, DRAFT_COMBINATION_ALIASES)).toEqual([]);

    await seedReferenceData(t.db, { drafts: false });
    expect(await snapshot()).toEqual(first);
  });

  it("keeps guides and videos awaiting review out of production's data", async () => {
    const statuses = async () => ({
      guides: (await t.db.select({ status: exerciseGuides.status }).from(exerciseGuides))
        .map((row) => row.status)
        .sort(),
      media: (await t.db.select({ status: exerciseMedia.status }).from(exerciseMedia))
        .map((row) => row.status)
        .sort(),
    });
    await seedReferenceData(t.db, { drafts: false });
    const production = await statuses();
    expect(production.guides.filter((status) => status !== "published")).toEqual([]);
    expect(production.media.filter((status) => status !== "approved")).toEqual([]);
    // A local database has them for review, and a production seed takes them out again.
    await seedReferenceData(t.db, { drafts: true });
    const local = await statuses();
    expect(local.guides).toContain("draft");
    expect(local.media).toContain("candidate");
    await seedReferenceData(t.db, { drafts: false });
    expect(await statuses()).toEqual(production);
  });

  it("adds every draft where drafts are asked for, moving no id, twice the same", async () => {
    await seedReferenceData(t.db, { drafts: false });
    const before = await snapshot();
    await seedReferenceData(t.db, { drafts: true });
    const after = await snapshot();
    const all = referenceManifests({ drafts: true });
    expect(slugsOf(after.types)).toEqual(slugsOf(all.types).sort());
    expect(slugsOf(after.library)).toEqual(slugsOf(all.exercises).sort());
    expect(slugsOf(after.combinations)).toEqual(slugsOf(all.combinations).sort());
    // What production already had keeps its id.
    for (const key of ["types", "library", "combinations", "presets", "warmups"] as const) {
      const ids = new Map(after[key].map((row) => [row.slug, row.id]));
      for (const row of before[key]) expect(ids.get(row.slug), row.slug).toBe(row.id);
    }
    // Every way as written, draft ways included, each with one primary.
    const ways = waysOf(after);
    for (const exercise of all.exercises)
      expect(ways.get(exercise.slug), exercise.slug).toEqual(asWritten(exercise));
    expect(after.members).toEqual(
      expect.arrayContaining([
        "multi_press 1 chest_press_machine",
        "multi_press 2 incline_press_machine",
        "multi_press 3 shoulder_press_machine",
      ]),
    );
    // The drafted aliases are there now.
    const aliases = (rows: { slug: string; aliases: string[] }[], slug: string) =>
      rows.find((row) => row.slug === slug)?.aliases;
    for (const [slug, drafted] of Object.entries(DRAFT_EQUIPMENT_ALIASES))
      expect(aliases(after.types, slug), slug).toEqual(expect.arrayContaining([...drafted]));
    for (const [slug, drafted] of Object.entries(DRAFT_EXERCISE_ALIASES))
      expect(aliases(after.library, slug), slug).toEqual(expect.arrayContaining([...drafted]));
    for (const [slug, drafted] of Object.entries(DRAFT_COMBINATION_ALIASES))
      expect(aliases(after.combinations, slug), slug).toEqual(expect.arrayContaining([...drafted]));

    await seedReferenceData(t.db, { drafts: true });
    expect(await snapshot()).toEqual(after);
  });
});

describe("programme templates", () => {
  it("offers at least one template, each a valid blueprint", () => {
    expect(PROGRAM_TEMPLATES.length).toBeGreaterThan(0);
    for (const template of PROGRAM_TEMPLATES) {
      expect(() => programBlueprintSchema.parse(template.blueprint)).not.toThrow();
      expect(template.slug).toBe(template.blueprint.slug);
      expect(template.highlights.length).toBeGreaterThan(0);
    }
  });

  it("has no start date of its own: whoever adopts it picks one", () => {
    expect(STRENGTH_AESTHETICS_HYBRID_8WK).not.toHaveProperty("startDate");
  });

  it("prescribes effort, never one person's kilos", () => {
    const notes = STRENGTH_AESTHETICS_HYBRID_8WK.days
      .flatMap((day) => day.exercises)
      .flatMap((exercise) => [exercise.targetLoadNote ?? "", exercise.notes ?? ""]);
    for (const note of notes) {
      expect(note, note).not.toMatch(/\d+(\.\d+)?\s*(kg|lb)\b/i);
    }
  });

  it("contains every training day and exercise of the 8-week plan", () => {
    const plan = STRENGTH_AESTHETICS_HYBRID_8WK;
    expect(plan.days.map((d) => d.name)).toEqual([
      "Lower A",
      "Upper A",
      "Easy Run + Arms",
      "Lower B",
      "Upper B",
      "Easy Run + Light Upper",
      "Rest + Mobility",
    ]);
    expect(plan.days.map((d) => d.dayOfWeek)).toEqual([2, 3, 4, 5, 6, 7, 1]);
    const setsPerDay = plan.days.map((d) => d.exercises.reduce((sum, e) => sum + e.sets, 0));
    expect(setsPerDay).toEqual([16, 19, 14, 13, 18, 10, 0]);
    expect(plan.days.flatMap((d) => d.exercises)).toHaveLength(37);
  });

  it("links every programme exercise, fallback and warm-up to seeded rows", () => {
    for (const template of PROGRAM_TEMPLATES) {
      for (const day of template.blueprint.days) {
        expect(warmupSlugs.has(day.warmupSlug), day.name).toBe(true);
        for (const ex of day.exercises) {
          const exercise = exerciseBySlug.get(ex.exerciseSlug);
          expect(exercise, ex.exerciseSlug).toBeDefined();
          expect(exercise?.isActive ?? true, `${ex.exerciseSlug} is inactive`).toBe(true);
          for (const f of ex.fallbacks ?? []) {
            expect(exerciseBySlug.has(f.exerciseSlug), f.exerciseSlug).toBe(true);
            if (f.equipmentTypeSlug) expect(equipmentTypeSlugs.has(f.equipmentTypeSlug)).toBe(true);
          }
        }
      }
    }
  });

  it("models the paired slots as agreed", () => {
    const lowerA = STRENGTH_AESTHETICS_HYBRID_8WK.days[0];
    const calf = lowerA?.exercises.find((e) => e.exerciseSlug === "smith-machine-calf-raise");
    expect(calf?.fallbacks?.map((f) => f.exerciseSlug)).toEqual([
      "leg-press-calf-press",
      "leg-press-calf-press",
    ]);
    const dayThree = STRENGTH_AESTHETICS_HYBRID_8WK.days[2];
    const forearms = dayThree?.exercises.filter((e) => e.supersetGroup === "forearms");
    expect(forearms?.map((e) => e.exerciseSlug)).toEqual(["wrist-curl", "reverse-wrist-curl"]);
  });

  it("backs up each machine the basics lack with one they provide (owner, 5 October 2026)", () => {
    const slots = STRENGTH_AESTHETICS_HYBRID_8WK.days.flatMap((day) => day.exercises);
    const backups = (slug: string) =>
      slots.find((e) => e.exerciseSlug === slug)?.fallbacks?.map((f) => f.exerciseSlug);
    expect(backups("preacher-curl")).toEqual(["incline-bench-preacher-curl", "ez-bar-curl"]);
    expect(backups("leg-press-horizontal")).toEqual(["leg-press-45"]);
    expect(backups("hip-abduction")).toEqual(["cable-hip-abduction"]);
    // So the coach can keep any slot with targets at a gym nobody has answered for, in production
    // too: a fallback still awaiting the owner never counts towards it.
    const basics = new Set([...ASSUMED_EQUIPMENT.gym, "bodyweight"]);
    const onBasics = (slug: string, primary?: string) =>
      requirementGroups(exerciseBySlug.get(slug)!).some(
        (group) => (!primary || group[0] === primary) && group.every((type) => basics.has(type)),
      );
    for (const slot of slots) {
      if (onBasics(slot.exerciseSlug)) continue;
      const covered = (slot.fallbacks ?? []).some(
        (f) =>
          exerciseBySlug.get(f.exerciseSlug)?.review !== "draft" &&
          onBasics(f.exerciseSlug, f.equipmentTypeSlug),
      );
      expect(covered, slot.exerciseSlug).toBe(true);
    }
  });

  it("plans only published exercises, so every account can adopt it", () => {
    for (const template of PROGRAM_TEMPLATES)
      for (const day of template.blueprint.days)
        for (const slot of day.exercises)
          expect(exerciseBySlug.get(slot.exerciseSlug)?.review, slot.exerciseSlug).toBeUndefined();
  });

  it("plans two easy runs a week for eight weeks", () => {
    const plan = STRENGTH_AESTHETICS_HYBRID_8WK;
    expect(plan.weeks).toBe(8);
    expect(plan.runs).toHaveLength(16);
    for (let week = 1; week <= 8; week++) {
      const days = plan.runs.filter((r) => r.weekIndex === week).map((r) => r.dayOfWeek);
      expect(days.sort()).toEqual([4, 7]);
    }
  });
});
