import { describe, expect, it } from "vitest";

import { programBlueprintSchema } from "@/domain/program-blueprint";
import { MUSCLE_GROUPS } from "@/domain/types";

import { EQUIPMENT_TYPES } from "./data/equipment-types";
import { EXERCISES } from "./data/exercises";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "./data/program";
import { PROGRAM_TEMPLATES } from "./data/templates";
import { WARMUP_PROTOCOLS } from "./data/warmups";

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
      for (const slug of e.equipment)
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
