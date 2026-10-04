import { describe, expect, it } from "vitest";

import { EQUIPMENT_DESCRIPTIONS } from "@/db/seed/data/equipment-descriptions";
import { EQUIPMENT_TYPES } from "@/db/seed/data/equipment-types";

import { sameNameCandidates, searchEquipment } from "./equipment-search";

/** The catalogue as it is seeded, with its names and aliases. */
const catalogue = EQUIPMENT_TYPES.map((type) => ({
  slug: type.slug,
  name: type.name,
  aliases: EQUIPMENT_DESCRIPTIONS[type.slug]?.aliases ?? [],
  purpose: EQUIPMENT_DESCRIPTIONS[type.slug]?.purpose ?? null,
}));
const slugs = (items: readonly { slug: string }[]) => items.map((item) => item.slug);

describe("equipment search", () => {
  it("finds an item by its name and by any of its other names alike", () => {
    expect(slugs(searchEquipment(catalogue, "Pec deck (fly / reverse fly)"))[0]).toBe("pec_deck");
    expect(slugs(searchEquipment(catalogue, "pec fly machine"))).toContain("pec_deck");
    expect(slugs(searchEquipment(catalogue, "Olympic bar"))[0]).toBe("barbell");
    expect(slugs(searchEquipment(catalogue, "curl bar"))).toContain("ez_bar");
  });

  it("puts the item of that name before one that merely carries it as an alias", () => {
    expect(slugs(searchEquipment(catalogue, "Lat pulldown"))[0]).toBe("lat_pulldown");
  });

  it("shows both machines a shared name means, rather than guessing", () => {
    const both = sameNameCandidates(catalogue, "roman chair");
    expect(slugs(both).sort()).toEqual(["back_extension_bench", "captains_chair"]);
    expect(sameNameCandidates(catalogue, "Smith machine")).toEqual([]);
  });

  it("lists everything, in catalogue order, for an empty query", () => {
    expect(searchEquipment(catalogue, "  ")).toHaveLength(catalogue.length);
  });

  it("finds nothing for a word nothing is called or used for", () => {
    expect(searchEquipment(catalogue, "zzzz")).toEqual([]);
  });
});
