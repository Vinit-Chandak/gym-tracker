// @vitest-environment jsdom
import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import { afterEach, describe, expect, it, vi } from "vitest";

import { reloadForUpdate } from "./app-update";
import {
  attempted,
  FORM_OUT_OF_DATE_MESSAGE,
  keepsErrorOnDisconnect,
  keepsFormOnDisconnect,
  keepsOutcomeOnDisconnect,
  OFFLINE_SUBMIT_MESSAGE,
  OUT_OF_DATE_MESSAGE,
  UPDATING_MESSAGE,
} from "./offline-submit";

vi.mock("./app-update", async (original) => ({
  ...(await original<typeof import("./app-update")>()),
  reloadForUpdate: vi.fn(() => true),
}));

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
  vi.mocked(reloadForUpdate).mockClear();
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

/**
 * The same rule for an action called directly. The case that mattered was not the network at
 * all: an expired sign-in makes the action redirect, and a bare catch reported that as a lost
 * connection — the athlete pressed Retry against a session that had ended.
 */
describe("an action called directly rather than through a form", () => {
  it("answers in the caller's own words when it never left the device", async () => {
    const restore = offline();
    const action = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await attempted(action, "Connection lost. Retry revoking.")).toEqual({
      ok: false,
      message: "Connection lost. Retry revoking.",
    });
    restore();
  });

  it("hands back what the action answered when it worked", async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, error: "That token is already gone." });
    expect(await attempted(action, "Connection lost.")).toEqual({
      ok: true,
      value: { ok: false, error: "That token is already gone." },
    });
  });

  it("passes on anything the connection is not, so a sign-out is not called a dropped signal", async () => {
    const action = vi.fn().mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(attempted(action, "Connection lost.")).rejects.toThrow("NEXT_REDIRECT");
  });
});

/**
 * After a deploy, a page left open names its actions by IDs the new release may not know. The
 * server refuses them and nothing was saved; the page needs the new release, not a retry.
 */
describe("a save from a page older than the server", () => {
  const unknownAction = () =>
    vi.fn().mockRejectedValue(new UnrecognizedActionError("Server Action was not found"));

  it("reloads into the new release when a set or a tap was refused", async () => {
    expect(await attempted(unknownAction(), "Connection lost.")).toEqual({
      ok: false,
      message: UPDATING_MESSAGE,
    });
    expect(reloadForUpdate).toHaveBeenCalledOnce();
  });

  it("says so, rather than reloading in a loop, when it has only just reloaded", async () => {
    vi.mocked(reloadForUpdate).mockReturnValueOnce(false);
    expect(await attempted(unknownAction(), "Connection lost.")).toEqual({
      ok: false,
      message: OUT_OF_DATE_MESSAGE,
    });
  });

  it("keeps what was typed in a form and reloads only when it is saved again", async () => {
    const action = unknownAction();
    const first = await keepsFormOnDisconnect(action)({}, form());
    expect(first.formError).toBe(FORM_OUT_OF_DATE_MESSAGE);
    expect(first.values).toEqual({ distanceKm: "5.4", notes: "Easy, shins quiet." });
    expect(reloadForUpdate).not.toHaveBeenCalled();

    const second = await keepsFormOnDisconnect(action)(first, form());
    expect(reloadForUpdate).toHaveBeenCalledOnce();
    expect(second.formError).toBe(UPDATING_MESSAGE);
    expect(second.values).toEqual({ distanceKm: "5.4", notes: "Easy, shins quiet." });
  });

  it("reloads at once from a skip or a form that echoes nothing back", async () => {
    expect(await keepsOutcomeOnDisconnect(unknownAction())({ ok: true }, form())).toEqual({
      ok: false,
      error: UPDATING_MESSAGE,
    });
    expect(await keepsErrorOnDisconnect(unknownAction())({}, form())).toEqual({
      error: UPDATING_MESSAGE,
    });
    expect(reloadForUpdate).toHaveBeenCalledTimes(2);
  });
});
