import { afterEach, describe, expect, it, vi } from "vitest";

import { markBegin, queryCounter, timeSetup, timeTransaction } from "./perf";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("request timing", () => {
  it("runs the transaction and logs nothing unless PERF_LOG=1", async () => {
    vi.stubEnv("PERF_LOG", "");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await timeTransaction("read", async () => {
      markBegin()();
      await timeSetup(async () => queryCounter.logQuery());
      return 7;
    });
    expect(result).toBe(7);
    expect(log).not.toHaveBeenCalled();
  });

  it("logs one line per transaction, counting only its own statements", async () => {
    vi.stubEnv("PERF_LOG", "1");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await Promise.all([
      timeTransaction("write", async () => {
        markBegin()();
        await timeSetup(async () => queryCounter.logQuery());
        queryCounter.logQuery();
      }),
      timeTransaction("read", async () => {
        await timeSetup(async () => queryCounter.logQuery());
      }),
    ]);
    const lines = log.mock.calls.map(([line]) => String(line));
    expect(lines).toHaveLength(2);
    expect(lines.find((line) => line.includes(" write "))).toMatch(
      /^\[perf\] db write \d+ms begin=\d+ms setup=\d+ms queries=2\b/,
    );
    expect(lines.find((line) => line.includes(" read "))).toMatch(/queries=1\b/);
  });

  it("still logs a transaction that fails, and passes the failure on", async () => {
    vi.stubEnv("PERF_LOG", "1");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(
      timeTransaction("write", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(log).toHaveBeenCalledTimes(1);
  });
});
