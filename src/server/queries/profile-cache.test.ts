import { describe, expect, it } from "vitest";

import { ProfileCache } from "./profile-cache";

const onboarded = { onboardedAt: new Date("2026-09-01T00:00:00Z"), timeZone: "Asia/Kolkata" };
const fresh = { onboardedAt: null, timeZone: "UTC" };

describe("ProfileCache", () => {
  it("returns a copy read within the time limit and forgets it afterwards", () => {
    const cache = new ProfileCache<typeof onboarded>(60_000);
    cache.set("a", onboarded, 1_000);
    expect(cache.get("a", 0, 30_000)).toBe(onboarded);
    expect(cache.get("a", 0, 61_000)).toBeNull();
    // Expiry is final: the entry is gone, not merely hidden.
    expect(cache.get("a", 0, 30_000)).toBeNull();
  });

  it("ignores a copy read before the browser's last profile write", () => {
    const cache = new ProfileCache<typeof onboarded>(60_000);
    cache.set("a", onboarded, 1_000);
    expect(cache.get("a", 1_000, 2_000)).toBe(onboarded);
    expect(cache.get("a", 1_500, 2_000)).toBeNull();
  });

  it("never remembers an account that has not finished onboarding", () => {
    const cache = new ProfileCache<typeof fresh>(60_000);
    cache.set("a", fresh, 1_000);
    expect(cache.get("a", 0, 1_001)).toBeNull();
  });

  it("drops a remembered copy once the account finishes or forgets", () => {
    const cache = new ProfileCache<typeof onboarded | typeof fresh>(60_000);
    cache.set("a", onboarded, 1_000);
    cache.set("a", fresh, 2_000);
    expect(cache.get("a", 0, 2_001)).toBeNull();
    cache.set("a", onboarded, 3_000);
    cache.forget("a");
    expect(cache.get("a", 0, 3_001)).toBeNull();
    cache.set("a", onboarded, 4_000);
    cache.clear();
    expect(cache.get("a", 0, 4_001)).toBeNull();
  });

  it("keeps accounts apart", () => {
    const cache = new ProfileCache<typeof onboarded>(60_000);
    cache.set("a", onboarded, 1_000);
    expect(cache.get("b", 0, 1_001)).toBeNull();
  });
});
