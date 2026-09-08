import { describe, expect, it } from "vitest";

import { slugify, uniqueSlug } from "./slug";

describe("slugs", () => {
  it("normalises display names", () => {
    expect(slugify("Anytime Fitness")).toBe("anytime-fitness");
    expect(slugify("  Société Gym!  ")).toBe("societe-gym");
    expect(slugify("45° Leg Press #1")).toBe("45-leg-press-1");
    expect(slugify("***")).toBe("item");
  });

  it("makes slugs unique with a numeric suffix", () => {
    expect(uniqueSlug("gym", [])).toBe("gym");
    expect(uniqueSlug("gym", ["gym"])).toBe("gym-2");
    expect(uniqueSlug("gym", ["gym", "gym-2"])).toBe("gym-3");
  });
});
