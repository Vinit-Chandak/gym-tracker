import { describe, expect, it, vi } from "vitest";

import { databaseWarmer, WARM_DATABASE_INTERVAL_MS } from "./keep-warm";

describe("databaseWarmer", () => {
  it("touches the database, then not again within the interval", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const warm = databaseWarmer(run, 30_000);
    expect(await warm(1_000)).toBe("touched");
    expect(await warm(1_000 + 29_999)).toBe("recent");
    expect(await warm(1_000 + 30_000)).toBe("touched");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("shares one touch among requests that arrive while it runs", async () => {
    let finish!: () => void;
    const run = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const warm = databaseWarmer(run);
    const first = warm(0);
    const second = warm(5);
    finish();
    expect(await Promise.all([first, second])).toEqual(["touched", "touched"]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("reports a failure without throwing, and tries again on the next request", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("Connection terminated"))
      .mockResolvedValue(undefined);
    const warm = databaseWarmer(run);
    expect(await warm(0)).toBe("failed");
    expect(await warm(1)).toBe("touched");
    expect(run).toHaveBeenCalledTimes(2);
  });

  /**
   * The page is public, so its database work is bounded by time, not by who asks: a burst of
   * requests, however large, costs one round of `select 1` per instance per interval.
   */
  it("bounds a burst to one touch per interval", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const warm = databaseWarmer(run);
    for (let at = 0; at < WARM_DATABASE_INTERVAL_MS * 3; at += 100) await warm(at);
    expect(run).toHaveBeenCalledTimes(3);
  });
});
