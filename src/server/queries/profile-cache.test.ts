import { describe, expect, it, vi } from "vitest";

import { ProfileCache } from "./profile-cache";

const onboarded = { onboardedAt: new Date("2026-09-01T00:00:00Z"), timeZone: "Asia/Kolkata" };
const fresh = { onboardedAt: null, timeZone: "UTC" };

describe("ProfileCache", () => {
  it("shares concurrent misses and starts a fresh read after a failed load", async () => {
    const cache = new ProfileCache<typeof onboarded>(60_000);
    const load = vi.fn(async () => onboarded);
    await Promise.all([cache.read("a", 0, load), cache.read("a", 0, load)]);
    expect(load).toHaveBeenCalledTimes(1);
    await expect(
      cache.read("b", 0, async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow("offline");
    expect(await cache.read("b", 0, load)).toBe(onboarded);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not repopulate the cache with a read invalidated while in flight", async () => {
    const cache = new ProfileCache<typeof onboarded>(60_000);
    let resolve!: (value: typeof onboarded) => void;
    const loading = cache.read(
      "a",
      0,
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await Promise.resolve();
    cache.forget("a");
    const changed = { ...onboarded, timeZone: "UTC" };
    await cache.read("a", 0, async () => changed);
    resolve(onboarded);
    await loading;
    expect(cache.get("a", 0)).toBe(changed);
  });

  it("does not join a pending read older than the browser's write stamp", async () => {
    const cache = new ProfileCache<typeof onboarded>(60_000);
    const load = vi.fn(async () => onboarded);
    await Promise.all([cache.read("a", 0, load), cache.read("a", Date.now() + 1, load)]);
    expect(load).toHaveBeenCalledTimes(2);
  });

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
