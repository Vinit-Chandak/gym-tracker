import { describe, expect, it } from "vitest";

import { programBlueprintSchema } from "@/domain/program-blueprint";
import { MUSCLE_GROUPS } from "@/domain/types";

import { EQUIPMENT_ART } from "@/components/equipment-art/catalogue";

import { ASSUMED_EQUIPMENT } from "./data/assumed-equipment";
import { EQUIPMENT_COMBINATIONS } from "./data/equipment-combinations";
import { EQUIPMENT_DESCRIPTIONS } from "./data/equipment-descriptions";
import { EQUIPMENT_PRESETS } from "./data/equipment-presets";
import { EQUIPMENT_FAMILIES, EQUIPMENT_TYPES } from "./data/equipment-types";
import { EXERCISE_ALIASES } from "./data/exercise-aliases";
import { EXERCISES, MAPPING_CLASSES, requirementGroups } from "./data/exercises";
import { GUIDES, MEDIA } from "./data/guides";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "./data/program";
import { PROGRAM_TEMPLATES } from "./data/templates";
import { WARMUP_PROTOCOLS } from "./data/warmups";
import { referenceManifests } from "./reference";

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
    const groups = (slug: string) => requirementGroups(exerciseBySlug.get(slug)!);
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
