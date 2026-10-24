// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import type { EquipmentCategory, ResistanceMode } from "@/domain/types";

import {
  GLYPH_LABELS,
  Glyph,
  type Destination,
  accessoryGlyph,
  cardioGlyph,
  exerciseGlyph,
  machineGlyph,
  modalityGlyph,
  typeGlyph,
} from "./glyphs";

afterEach(cleanup);

const kind = (typeSlug: string, typeCategory: EquipmentCategory, resistanceMode: ResistanceMode) =>
  machineGlyph({ typeSlug, typeCategory, resistanceMode });

it("draws a machine as what it is: an accessory as itself, however it is loaded", () => {
  // A gym's list drew a flat bench as the pull-up bar and a dip belt as a dumbbell.
  expect(kind("flat_bench", "accessory", "bodyweight")).toBe("accessory");
  expect(kind("dip_belt", "accessory", "free_weight")).toBe("accessory");
  // The ab wheel is drawn as itself, never as the bench.
  expect(kind("ab_wheel", "accessory", "bodyweight")).toBe("abWheel");
  expect(kind("cable_station", "cable", "selectorized")).toBe("cable");
  expect(kind("leg_press_45", "machine", "plate_loaded")).toBe("machine");
  expect(kind("pec_deck", "machine", "selectorized")).toBe("machine");
  expect(kind("pull_up_bar", "bodyweight", "bodyweight")).toBe("bodyweight");
  expect(kind("air_bike", "cardio", "cardio")).toBe("trainer");
  expect(kind("dumbbells", "free_weight", "free_weight")).toBe("dumbbell");
});

it("draws the Smith machine and every cardio machine with a glyph of its own as itself", () => {
  // A gym's list drew the Smith machine as a weight stack and a treadmill as a bike.
  expect(kind("smith_machine", "machine", "plate_loaded")).toBe("smith");
  expect(kind("treadmill", "cardio", "cardio")).toBe("treadmill");
  expect(kind("rowing_machine", "cardio", "cardio")).toBe("rower");
  expect(kind("ski_erg", "cardio", "cardio")).toBe("skiErg");
  expect(kind("stair_climber", "cardio", "cardio")).toBe("stairClimber");
  expect(kind("elliptical", "cardio", "cardio")).toBe("elliptical");
  // Every bike is the indoor bike, which stands for a cardio machine with no glyph of its own.
  for (const slug of ["bike", "spin_bike", "air_bike", "vertical_climber"])
    expect(cardioGlyph(slug)).toBe("trainer");
});

it("has a glyph of its own for a machine's type only where the type is drawn as itself", () => {
  expect(typeGlyph({ typeSlug: "ab_wheel", typeCategory: "accessory" })).toBe("abWheel");
  expect(typeGlyph({ typeSlug: "flat_bench", typeCategory: "accessory" })).toBe("accessory");
  expect(typeGlyph({ typeSlug: "smith_machine", typeCategory: "machine" })).toBe("smith");
  expect(typeGlyph({ typeSlug: "rowing_machine", typeCategory: "cardio" })).toBe("rower");
  // Anything else is drawn by what loads it, where it is named.
  expect(typeGlyph({ typeSlug: "leg_press_45", typeCategory: "machine" })).toBeNull();
  expect(typeGlyph({ typeSlug: "cable_station", typeCategory: "cable" })).toBeNull();
  expect(typeGlyph({ typeSlug: "barbell", typeCategory: "free_weight" })).toBeNull();
});

it("draws cardio as the machine it is done on, never as the weight stack", () => {
  // The library led every cardio row with the stack: Elliptical, Rowing machine, Battle ropes.
  expect(modalityGlyph("cardio")).toBeNull();
  expect(modalityGlyph("machine")).toBe("machine");
  const cardio = (cardioMachine: string | null) =>
    exerciseGlyph({ modality: "cardio", cardioMachine });
  expect(cardio("rowing_machine")).toBe("rower");
  expect(cardio("treadmill")).toBe("treadmill");
  expect(cardio("elliptical")).toBe("elliptical");
  expect(cardio("bike")).toBe("trainer");
  // Done on no machine (battle ropes, a sled), its words say it.
  expect(cardio(null)).toBeNull();
  // Anything else is drawn by what loads it, whatever it is done on.
  expect(exerciseGlyph({ modality: "barbell", cardioMachine: null })).toBe("dumbbell");
  expect(exerciseGlyph({ modality: "bodyweight", cardioMachine: null })).toBe("bodyweight");
});

it("draws the ab wheel as itself and every other accessory as the bench", () => {
  expect(accessoryGlyph("ab_wheel")).toBe("abWheel");
  for (const slug of ["adjustable_bench", "back_extension_bench", "power_rack", "jump_rope"])
    expect(accessoryGlyph(slug)).toBe("accessory");
});

it("names the accessories' glyphs where they say something, and hides them where not", () => {
  const { container, rerender } = render(<Glyph name="accessory" />);
  const svg = container.querySelector("svg")!;
  expect(svg.getAttribute("aria-hidden")).toBe("true");
  // On the glyphs' grid, in ink: a pad, two legs and their feet.
  expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
  expect(svg.getAttribute("stroke")).toBe("currentColor");
  expect(svg.getAttribute("stroke-width")).toBe("2");
  expect(svg.querySelectorAll("rect, path")).toHaveLength(3);
  rerender(<Glyph name="accessory" label={GLYPH_LABELS.accessory} />);
  expect(screen.getByRole("img", { name: "Accessory" })).toBeTruthy();
  // The ab wheel: its wheel, the handle out each side, and the grips.
  rerender(<Glyph name="abWheel" />);
  expect(container.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
  expect(container.querySelectorAll("svg rect, svg path")).toHaveLength(3);
  rerender(<Glyph name="abWheel" label={GLYPH_LABELS.abWheel} />);
  expect(screen.getByRole("img", { name: "Ab wheel" })).toBeTruthy();
});

it("draws the cardio machines on the glyphs' grid, each named where it says something", () => {
  const { container, rerender } = render(<Glyph name="rower" />);
  for (const [name, label] of [
    ["rower", "Rowing machine"],
    ["skiErg", "Ski erg"],
    ["stairClimber", "Stair climber"],
    ["elliptical", "Elliptical"],
  ] as const) {
    rerender(<Glyph name={name} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    expect(svg.getAttribute("stroke-width")).toBe("2");
    // Drawn in strokes alone, as every glyph of the set is: nothing filled, no stroke of its own.
    for (const part of svg.querySelectorAll("path, rect, circle")) {
      expect(part.getAttribute("fill")).toBeNull();
      expect(part.getAttribute("stroke-width")).toBeNull();
    }
    rerender(<Glyph name={name} label={GLYPH_LABELS[name]} />);
    expect(screen.getByRole("img", { name: label })).toBeTruthy();
  }
});

/**
 * Owner, 21 October 2026: Today, Plan and Progress were built from the same squares and circles,
 * and looked alike, worst of all filled. Each destination is now its own silhouette.
 */
it("draws the five destinations as five silhouettes, at rest and where you are", () => {
  const { container, rerender } = render(<Glyph name="today" />);
  const drawing = (name: Destination, filled: boolean) => {
    rerender(<Glyph name={name} filled={filled} />);
    return container.querySelector("svg")!.innerHTML;
  };
  const destinations = ["today", "training", "food", "progress", "profile"] as const;
  for (const filled of [false, true])
    expect(new Set(destinations.map((name) => drawing(name, filled))).size).toBe(5);
});

it("lights Today as the app's mark, its slab and disc in their pigments", () => {
  const { container, rerender } = render(<Glyph name="today" />);
  const parts = () => {
    const svg = container.querySelector("svg")!;
    return {
      slab: svg.querySelector("rect")!,
      disc: svg.querySelector("circle")!,
      line: svg.querySelector("path")!,
    };
  };
  // At rest: outlined in the tab's ink, nothing filled.
  let { slab, disc, line } = parts();
  for (const part of [slab, disc, line]) {
    expect(part.getAttribute("style")).toBeNull();
    expect(part.getAttribute("fill")).toBeNull();
    expect(part.hasAttribute("data-pigment")).toBe(false);
  }
  expect(line.getAttribute("d")).toBe("M3 20h18");
  // Lit: the slab in lifting's ultramarine, the disc in running's vermilion, fill and edge; the
  // line stays the tab's ink.
  rerender(<Glyph name="today" filled />);
  ({ slab, disc, line } = parts());
  expect(slab.style.fill).toBe("var(--ov-print-strength)");
  expect(slab.style.stroke).toBe("var(--ov-print-strength)");
  expect(slab.getAttribute("data-pigment")).toBe("strength");
  expect(disc.style.fill).toBe("var(--ov-print-run)");
  expect(disc.style.stroke).toBe("var(--ov-print-run)");
  expect(disc.getAttribute("data-pigment")).toBe("run");
  expect(line.getAttribute("style")).toBeNull();
});

it("lights Plan's calendar by its head and today's square, and Progress's bar by its plates", () => {
  const { container, rerender } = render(<Glyph name="training" />);
  const filledParts = () =>
    [...container.querySelectorAll("svg > *")].filter(
      (part) => part.getAttribute("fill") === "currentColor",
    );
  // At rest the calendar's head is a line under its rings, and today's square an outline.
  expect(filledParts()).toHaveLength(0);
  expect(container.querySelector('path[d="M3.5 10h17"]')).not.toBeNull();
  rerender(<Glyph name="training" filled />);
  expect(filledParts().map((part) => part.tagName)).toEqual(["path", "rect"]);
  expect(filledParts()[1]!.getAttribute("width")).toBe("3.4");
  // The rise: three blocks, each a size up, climbing corner to corner, filled where you are.
  rerender(<Glyph name="progress" />);
  expect(filledParts()).toHaveLength(0);
  expect(container.querySelectorAll("rect")).toHaveLength(3);
  rerender(<Glyph name="progress" filled />);
  expect(filledParts().map((part) => part.getAttribute("height"))).toEqual(["5", "6", "7"]);
  expect(GLYPH_LABELS.training).toBe("Plan");
});
