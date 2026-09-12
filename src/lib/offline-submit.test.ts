// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  keepsErrorOnDisconnect,
  keepsFormOnDisconnect,
  keepsOutcomeOnDisconnect,
  OFFLINE_SUBMIT_MESSAGE,
} from "./offline-submit";

/**
 * A save that never left the device must not reach the error boundary: that replaces the
 * screen, and with it everything the athlete had typed into a form they fill in once.
 */
function offline() {
  const was = Object.getOwnPropertyDescriptor(navigator, "onLine");
  Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
  return () => {
    if (was) Object.defineProperty(navigator, "onLine", was);
  };
}

afterEach(() => {
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

const form = () => {
  const data = new FormData();
  data.set("distanceKm", "5.4");
  data.set("notes", "Easy, shins quiet.");
  return data;
};

describe("a form whose save never left the device", () => {
  it("says so and hands back what was typed", async () => {
    const restore = offline();
    const action = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const state = await keepsFormOnDisconnect(action)({}, form());
    expect(state.formError).toBe(OFFLINE_SUBMIT_MESSAGE);
    expect(state.values).toEqual({ distanceKm: "5.4", notes: "Easy, shins quiet." });
    restore();
  });

  it("drops the field errors of the attempt before it", async () => {
    const restore = offline();
    const action = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const state = await keepsFormOnDisconnect(action)(
      { fieldErrors: { distanceKm: "Enter a distance." } },
      form(),
    );
    expect(state.fieldErrors).toBeUndefined();
    restore();
  });

  it("reports it on a form that has only one message, without echoing the fields", async () => {
    const restore = offline();
    const action = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const state = await keepsErrorOnDisconnect(action)({}, form());
    expect(state).toEqual({ error: OFFLINE_SUBMIT_MESSAGE });
    restore();
  });

  it("answers a skip with a refusal rather than throwing", async () => {
    const restore = offline();
    const action = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const state = await keepsOutcomeOnDisconnect(action)({ ok: true }, form());
    expect(state).toEqual({ ok: false, error: OFFLINE_SUBMIT_MESSAGE });
    restore();
  });

  it("is recognised by the failure itself when the browser still claims to be online", async () => {
    // A device on WiFi with nothing behind it reports online; the fetch still never lands.
    const action = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const state = await keepsFormOnDisconnect(action)({}, form());
    expect(state.formError).toBe(OFFLINE_SUBMIT_MESSAGE);
  });
});

describe("everything else", () => {
  it("passes a server's own failure on to the error boundary", async () => {
    const boom = Object.assign(new Error("Something went wrong"), { digest: "1234567890" });
    const action = vi.fn().mockRejectedValue(boom);
    await expect(keepsFormOnDisconnect(action)({}, form())).rejects.toThrow("Something went wrong");
  });

  it("passes one on from a form that has only one message", async () => {
    const action = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(keepsErrorOnDisconnect(action)({}, form())).rejects.toThrow("boom");
  });

  it("but while the browser says it is offline, nothing could have answered", async () => {
    // No server can reply to a device with no network, so whatever the failure looks like,
    // the connection is what it was.
    const restore = offline();
    const action = vi.fn().mockRejectedValue(new Error("boom"));
    expect((await keepsErrorOnDisconnect(action)({}, form())).error).toBe(OFFLINE_SUBMIT_MESSAGE);
    restore();
  });

  it("returns what the action returned when it works", async () => {
    const action = vi.fn().mockResolvedValue({ values: { distanceKm: "5.4" } });
    expect(await keepsFormOnDisconnect(action)({}, form())).toEqual({
      values: { distanceKm: "5.4" },
    });
  });
});
