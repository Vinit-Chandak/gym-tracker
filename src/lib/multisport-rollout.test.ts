import { describe, expect, it } from "vitest";

import { enabledSports, multisportRollout } from "./multisport-rollout";

/**
 * The rollout order is the safety story: nothing new is on unless it is said to be, and a new
 * sport cannot appear before there is a canonical writer to record it (plan §10.4).
 */
describe("the rollout gate", () => {
  it("is off by default", () => {
    expect(multisportRollout({})).toEqual({
      canonicalWrites: false,
      sharedNavigation: false,
      newSports: false,
    });
    expect(enabledSports(multisportRollout({}))).toEqual(["strength", "running"]);
  });

  it("refuses new sports while legacy tables are still authoritative", () => {
    const capabilities = multisportRollout({ MULTISPORT_NEW_SPORTS: "true" });
    expect(capabilities.newSports).toBe(false);
    expect(enabledSports(capabilities)).toEqual(["strength", "running"]);
  });

  it("offers four sports once the canonical writer is on and they are asked for", () => {
    const capabilities = multisportRollout({
      MULTISPORT_CANONICAL_WRITES: "true",
      MULTISPORT_NEW_SPORTS: "true",
    });
    expect(capabilities.newSports).toBe(true);
    expect(enabledSports(capabilities)).toEqual(["strength", "running", "cycling", "swimming"]);
  });

  it("takes one switch for the whole release", () => {
    expect(multisportRollout({ MULTISPORT_ROLLOUT: "on" })).toEqual({
      canonicalWrites: true,
      sharedNavigation: true,
      newSports: true,
    });
  });

  it("reads only the values that mean yes", () => {
    expect(multisportRollout({ MULTISPORT_CANONICAL_WRITES: "yes" }).canonicalWrites).toBe(false);
    expect(multisportRollout({ MULTISPORT_CANONICAL_WRITES: "1" }).canonicalWrites).toBe(true);
  });
});
