// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import type { EquipmentCategory, ResistanceMode } from "@/domain/types";

import { GLYPH_LABELS, Glyph, accessoryGlyph, machineGlyph } from "./glyphs";

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
