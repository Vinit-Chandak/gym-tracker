import { expect, it } from "vitest";

import { PROGRAM_TEMPLATES, type ProgramTemplate } from "@/db/seed/data/templates";

import { blueprintSports, templateOffer } from "./next-block";

const HYBRID = PROGRAM_TEMPLATES[0]!;
/** The hybrid with its runs taken out: a template that lifts and nothing else. */
const LIFTING: ProgramTemplate = {
  ...HYBRID,
  slug: "lifting-only",
  name: "Lifting only",
  blueprint: {
    ...HYBRID.blueprint,
    days: HYBRID.blueprint.days.map((day) => ({ ...day, includesRun: false })),
  },
};

it("reads the sports a template asks for from its days", () => {
  expect(blueprintSports(HYBRID.blueprint)).toEqual(["strength", "running"]);
  expect(blueprintSports(LIFTING.blueprint)).toEqual(["strength"]);
});

it("says a template asks for a sport the athlete has off, and calls the only one no suggestion", () => {
  // Aarav, Jordan: Strength alone on, offered the hybrid and its two easy runs.
  const offer = templateOffer([HYBRID], ["strength"]);
  expect(offer.heading).toBe("Or start from a template");
  expect(offer.options.map((option) => option.note)).toEqual([
    "Includes running, which is off in your sports.",
  ]);
  // Meera runs and lifts: nothing to say.
  expect(templateOffer([HYBRID], ["strength", "running"]).options[0]!.note).toBeUndefined();
});

it("puts the templates that fit the athlete's sports first, and suggests them", () => {
  const offer = templateOffer([HYBRID, LIFTING], ["strength"]);
  expect(offer.options.map((option) => option.slug)).toEqual(["lifting-only", HYBRID.slug]);
  expect(offer.heading).toBe("Or use a suggested template");
  // None fits: the catalogue's order, and nothing called suggested.
  expect(templateOffer([HYBRID, LIFTING], ["running"]).heading).toBe("Or start from a template");
});
