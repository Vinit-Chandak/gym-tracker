import { describe, expect, it } from "vitest";

import { MUSCLE_GROUPS } from "@/domain/types";

import { EQUIPMENT_TYPES } from "./data/equipment-types";
import { EXERCISES } from "./data/exercises";
import { ANYTIME_FITNESS_EQUIPMENT, STARTER_GYMS } from "./data/gyms";
import { PROGRAM } from "./data/program";
import { WARMUP_PROTOCOLS } from "./data/warmups";

const exerciseBySlug = new Map(EXERCISES.map((e) => [e.slug, e]));
const equipmentTypeSlugs = new Set(EQUIPMENT_TYPES.map((t) => t.slug));
const warmupSlugs = new Set(WARMUP_PROTOCOLS.map((w) => w.slug));

describe("seed data integrity", () => {
  it("has unique slugs everywhere", () => {
    expect(new Set(EXERCISES.map((e) => e.slug)).size).toBe(EXERCISES.length);
    expect(equipmentTypeSlugs.size).toBe(EQUIPMENT_TYPES.length);
    expect(warmupSlugs.size).toBe(WARMUP_PROTOCOLS.length);
    expect(new Set(STARTER_GYMS.map((g) => g.slug)).size).toBe(STARTER_GYMS.length);
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
    for (const item of ANYTIME_FITNESS_EQUIPMENT) {
      expect(equipmentTypeSlugs.has(item.equipmentTypeSlug), item.name).toBe(true);
    }
  });

  it("contains every training day and exercise of the 8-week plan", () => {
    expect(PROGRAM.days.map((d) => d.name)).toEqual([
      "Lower A",
      "Upper A",
      "Easy Run + Arms",
      "Lower B",
      "Upper B",
      "Easy Run + Light Upper",
      "Rest + Mobility",
    ]);
    expect(PROGRAM.days.map((d) => d.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // Per-exercise LIFTING sheet totals (the WEEK summary under-counted three days).
    // Wednesday counts 2 sets of wrist curls plus 2 sets of reverse wrist curls.
    const setsPerDay = PROGRAM.days.map((d) => d.exercises.reduce((sum, e) => sum + e.sets, 0));
    expect(setsPerDay).toEqual([16, 19, 14, 13, 18, 10, 0]);
    expect(PROGRAM.days.flatMap((d) => d.exercises)).toHaveLength(37);
  });

  it("links every programme exercise, fallback and warm-up to seeded rows", () => {
    for (const day of PROGRAM.days) {
      expect(warmupSlugs.has(day.warmupSlug), day.name).toBe(true);
      for (const ex of day.exercises) {
        const exercise = exerciseBySlug.get(ex.exerciseSlug);
        expect(exercise, ex.exerciseSlug).toBeDefined();
        expect(exercise?.isActive ?? true, `${ex.exerciseSlug} is inactive`).toBe(true);
        if (ex.duration) expect(ex.reps).toBeUndefined();
        else expect(ex.reps).toBeDefined();
        expect(ex.rir[0]).toBeLessThanOrEqual(ex.rir[1]);
        expect(ex.rest[0]).toBeLessThanOrEqual(ex.rest[1]);
        for (const f of ex.fallbacks ?? []) {
          expect(exerciseBySlug.has(f.exerciseSlug), f.exerciseSlug).toBe(true);
          if (f.equipmentTypeSlug) expect(equipmentTypeSlugs.has(f.equipmentTypeSlug)).toBe(true);
        }
      }
    }
  });

  it("models the paired slots as agreed", () => {
    const lowerA = PROGRAM.days[0];
    const calf = lowerA?.exercises.find((e) => e.exerciseSlug === "smith-machine-calf-raise");
    expect(calf?.fallbacks?.map((f) => f.exerciseSlug)).toEqual([
      "leg-press-calf-press",
      "leg-press-calf-press",
    ]);
    const wednesday = PROGRAM.days[2];
    const forearms = wednesday?.exercises.filter((e) => e.supersetGroup === "forearms");
    expect(forearms?.map((e) => e.exerciseSlug)).toEqual(["wrist-curl", "reverse-wrist-curl"]);
  });

  it("plans two easy runs a week for eight weeks, starting 8 September 2026", () => {
    expect(PROGRAM.startDate).toBe("2026-09-08");
    expect(PROGRAM.weeks).toBe(8);
    expect(PROGRAM.runs).toHaveLength(16);
    for (let week = 1; week <= 8; week++) {
      const days = PROGRAM.runs.filter((r) => r.weekIndex === week).map((r) => r.dayOfWeek);
      expect(days.sort()).toEqual([3, 6]);
    }
    for (const run of PROGRAM.runs) {
      expect(run.duration[0]).toBeLessThanOrEqual(run.duration[1]);
      expect(run.rpe[0]).toBeLessThanOrEqual(run.rpe[1]);
    }
  });

  it("seeds three real gyms plus Outdoor and Home, with one default", () => {
    expect(STARTER_GYMS.filter((g) => g.kind === "gym").map((g) => g.name)).toEqual([
      "Anytime Fitness",
      "Samsung Gym",
      "Society Gym",
    ]);
    expect(STARTER_GYMS.filter((g) => g.isDefault)).toHaveLength(1);
    expect(ANYTIME_FITNESS_EQUIPMENT).toHaveLength(7);
  });
});
