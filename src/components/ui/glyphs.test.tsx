// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { GLYPH_LABELS, Glyph, machineGlyph } from "./glyphs";

afterEach(cleanup);

it("draws a machine as what it is: an accessory as the bench, however it is loaded", () => {
  // A gym's list drew a flat bench as the pull-up bar and a dip belt as a dumbbell.
  expect(machineGlyph("accessory", "bodyweight")).toBe("accessory");
  expect(machineGlyph("accessory", "free_weight")).toBe("accessory");
  expect(machineGlyph("cable", "selectorized")).toBe("cable");
  expect(machineGlyph("machine", "plate_loaded")).toBe("machine");
  expect(machineGlyph("machine", "selectorized")).toBe("machine");
  expect(machineGlyph("bodyweight", "bodyweight")).toBe("bodyweight");
  expect(machineGlyph("cardio", "cardio")).toBe("trainer");
  expect(machineGlyph("free_weight", "free_weight")).toBe("dumbbell");
});

it("names the accessory's glyph where it says something, and hides it where it does not", () => {
  const { container, rerender } = render(<Glyph name="accessory" />);
  const svg = container.querySelector("svg")!;
  expect(svg.getAttribute("aria-hidden")).toBe("true");
  // On the glyphs' grid, in ink: a pad, two legs and their feet.
  expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
  expect(svg.getAttribute("stroke")).toBe("currentColor");
  expect(svg.querySelectorAll("rect, path")).toHaveLength(3);
  rerender(<Glyph name="accessory" label={GLYPH_LABELS.accessory} />);
  expect(screen.getByRole("img", { name: "Accessory" })).toBeTruthy();
});
