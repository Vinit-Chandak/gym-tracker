// @vitest-environment jsdom
import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isMissingCode,
  isOutOfDate,
  reloadForMissingCode,
  reloadForUpdate,
  reloadIfOutOfDate,
} from "./app-update";

const reload = vi.fn();

beforeEach(() => {
  vi.stubGlobal("location", { reload });
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  reload.mockReset();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

const chunkError = () =>
  Object.assign(new Error("Failed to load chunk /_next/static/chunks/0abc.js"), {
    name: "ChunkLoadError",
  });

describe("telling a page older than the server from other failures", () => {
  it("knows a save the server no longer recognises, and code that would not load", () => {
    expect(isOutOfDate(new UnrecognizedActionError("Server Action was not found"))).toBe(true);
    expect(isMissingCode(chunkError())).toBe(true);
  });

  it("leaves the rest alone", () => {
    for (const error of [new TypeError("Failed to fetch"), new Error("boom"), "boom", null]) {
      expect(isOutOfDate(error)).toBe(false);
      expect(isMissingCode(error)).toBe(false);
    }
  });
});

describe("reloading into the new release", () => {
  it("reloads once, and not again while the same failure comes straight back", () => {
    vi.useFakeTimers();
    expect(reloadForUpdate()).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(30_000);
    expect(reloadForUpdate()).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
    // A minute on, it is a new deploy rather than the same failure.
    vi.advanceTimersByTime(31_000);
    expect(reloadForUpdate()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("does not reload where it cannot remember having done so", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementationOnce(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });
    expect(reloadForUpdate()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads for missing code only once the server is known to answer", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetch);
    expect(await reloadForMissingCode()).toBe(false);
    expect(reload).not.toHaveBeenCalled();

    fetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
    expect(await reloadForMissingCode()).toBe(true);
    expect(fetch).toHaveBeenLastCalledWith("/offline.html", { method: "HEAD", cache: "no-store" });
    expect(reload).toHaveBeenCalledOnce();
  });

  it("does not ask the server at all while the browser says it is offline", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    expect(await reloadForMissingCode()).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is what an error screen does for either failure, and nothing else", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null)));
    reloadIfOutOfDate(new Error("boom"));
    await Promise.resolve();
    expect(reload).not.toHaveBeenCalled();
    reloadIfOutOfDate(new UnrecognizedActionError("Server Action was not found"));
    expect(reload).toHaveBeenCalledOnce();
  });
});
