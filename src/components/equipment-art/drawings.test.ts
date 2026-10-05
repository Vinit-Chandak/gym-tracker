import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { EQUIPMENT_COMBINATIONS } from "@/db/seed/data/equipment-combinations";
import { EQUIPMENT_TYPES } from "@/db/seed/data/equipment-types";

import { DRAWINGS_MODULE, readDrawings, renderDrawingsModule } from "./build";
import { EQUIPMENT_ART } from "./catalogue";

/*
 * The drawings' spec (docs/planning/equipment-art-pilot.md, DESIGN.md Illustrations), checked on
 * every source file: one colour that is the ink, the glyphs' stroke, nothing a theme cannot
 * recolour, nothing that means something else in this app.
 */

const ROOT =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
const ELEMENTS = new Set([
  "svg",
  "line",
  "path",
  "rect",
  "circle",
  "polygon",
  "polyline",
  "ellipse",
]);
const SLUGS = new Set([
  ...EQUIPMENT_TYPES.map((type) => type.slug),
  ...EQUIPMENT_COMBINATIONS.map((combination) => combination.slug),
]);

describe("equipment drawings", async () => {
  const drawings = await readDrawings();

  it("bundles every source as it stands", async () => {
    expect(readFileSync(DRAWINGS_MODULE, "utf8")).toBe(await renderDrawingsModule());
  });

  it("names each drawing by a catalogue slug, and lists each in the art catalogue", () => {
    for (const slug of Object.keys(drawings)) {
      expect(SLUGS.has(slug), `${slug} is not an equipment type or combination`).toBe(true);
      expect(EQUIPMENT_ART[slug], `${slug} has no entry in EQUIPMENT_ART`).toBeDefined();
    }
    for (const slug of Object.keys(EQUIPMENT_ART))
      expect(drawings[slug], `EQUIPMENT_ART lists ${slug}, which has no drawing`).toBeDefined();
  });

  it("keeps an approved drawing's reviewer and date", () => {
    for (const [slug, entry] of Object.entries(EQUIPMENT_ART)) {
      if (entry.status !== "approved") continue;
      expect(entry.reviewer, `${slug} is approved without a reviewer`).toBeTruthy();
      expect(entry.reviewedOn, `${slug} is approved without a date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it.each(Object.entries(drawings))("%s follows the drawing spec", (_slug, svg) => {
    expect(svg.startsWith(ROOT)).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    for (const [, name] of svg.matchAll(/<([a-z]+)[\s/>]/g)) expect(ELEMENTS.has(name!)).toBe(true);
    // Ink only: every colour is the current one, or none.
    for (const [, value] of svg.matchAll(/(?:fill|stroke)="([^"]*)"/g))
      expect(["currentColor", "none"]).toContain(value);
    // One tonal level, for upholstery: a fill opacity of 0.14 and nothing else.
    for (const [, value] of svg.matchAll(/fill-opacity="([^"]*)"/g)) expect(value).toBe("0.14");
    // Nothing a theme cannot recolour, and no dash: a dashed edge means skipped here.
    expect(svg).not.toMatch(/stroke-dasharray|stroke-opacity|style=|class=|transform=|<text|id=/);
    // The glyphs' stroke throughout.
    for (const [, width] of svg.matchAll(/stroke-width="([^"]*)"/g)) expect(width).toBe("2");
  });
});
